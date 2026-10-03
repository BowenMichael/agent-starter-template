#!/usr/bin/env node
/**
 * One-Click Setup Script for Agent-Driven Development Repositories
 * Automates:
 * 1. GitHub Workflow Labels (agent:ready, agent:in-progress, etc.)
 * 2. GitHub Project V2 Kanban Board (5 columns: Backlog, Ready for Agent, In Progress, In Review, Done)
 * 3. Links Project Board directly to the repository
 * 
 * Usage: node setup.js <owner/repo> <github-token>
 */

const https = require('https');
const fs = require('fs');

const [,, targetRepo, token] = process.argv;

if (!targetRepo || !token) {
  console.log('Usage: node setup.js <owner/repo> <github-token>');
  console.log('Example: node setup.js myorg/my-new-app ghp_xxxxxxxxxxxx');
  process.exit(1);
}

const [owner, repo] = targetRepo.split('/');
const BLUEPRINT_PROJECT_ID = "PVT_kwHOAgkA3s4Blmhh"; // Standard 5-column Blueprint Board

function restRequest(path, method, payload) {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'Agent-Template-Setup',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function graphqlRequest(query, variables) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'User-Agent': 'Agent-Template-Setup',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const labels = [
  { name: 'agent:ready', color: '0e8a16', description: 'Queued for autonomous agent pick-up' },
  { name: 'agent:in-progress', color: 'fbca04', description: 'Agent actively implementing & testing' },
  { name: 'agent:needs-approval', color: 'd93f0b', description: 'Paused: High token usage or scope clarification needed' },
  { name: 'agent:review', color: '6f42c1', description: 'PR opened with video demo & screenshots' }
];

async function main() {
  console.log(`🚀 Initializing Agent-Driven Workflow for ${owner}/${repo}...\n`);

  // 1. Create Workflow Labels
  console.log('🏷️  [1/3] Setting up GitHub workflow labels...');
  for (const label of labels) {
    const res = await restRequest(`/repos/${owner}/${repo}/labels`, 'POST', label);
    if (res.status === 201) {
      console.log(`   ✅ Created label: ${label.name}`);
    } else if (res.status === 422) {
      console.log(`   ℹ️  Label already exists: ${label.name}`);
    } else {
      console.log(`   ⚠️  Label ${label.name}: ${res.status}`);
    }
  }

  // 2. Fetch User & Repository Node IDs
  console.log('\n📋 [2/3] Querying GitHub user and repository IDs...');
  const idQuery = `
    query($owner: String!, $repo: String!) {
      viewer { id login }
      repository(owner: $owner, name: $repo) { id nameWithOwner }
    }
  `;
  const idRes = await graphqlRequest(idQuery, { owner, repo });
  const viewer = idRes.data?.data?.viewer;
  const repository = idRes.data?.data?.repository;

  if (!viewer || !repository) {
    console.error('❌ Failed to retrieve user/repository IDs from GitHub GraphQL. Please verify your token permissions.');
    process.exit(1);
  }

  // 3. Provision GitHub Project V2 Board from Template Blueprint
  console.log(`\n📊 [3/3] Provisioning GitHub Project Board for ${owner}/${repo}...`);
  const projectTitle = `${repo} - Sprint & Agent Board`;
  const copyMutation = `
    mutation($projectId: ID!, $ownerId: ID!, $title: String!) {
      copyProjectV2(input: {
        projectId: $projectId,
        ownerId: $ownerId,
        title: $title,
        includeDraftIssues: false
      }) {
        projectV2 {
          id
          number
          title
          url
        }
      }
    }
  `;
  const copyRes = await graphqlRequest(copyMutation, {
    projectId: BLUEPRINT_PROJECT_ID,
    ownerId: viewer.id,
    title: projectTitle
  });

  const newProject = copyRes.data?.data?.copyProjectV2?.projectV2;
  if (!newProject) {
    console.warn('⚠️ Could not automatically duplicate Project Board via GraphQL. Details:', JSON.stringify(copyRes.data?.errors || copyRes));
  } else {
    console.log(`   ✅ Created Project Board: "${newProject.title}"`);
    console.log(`   🔗 URL: ${newProject.url}`);
    console.log(`   🔑 Project ID: ${newProject.id}`);

    // Link Project to Repository
    const linkMutation = `
      mutation($projectId: ID!, $repositoryId: ID!) {
        linkProjectV2ToRepository(input: { projectId: $projectId, repositoryId: $repositoryId }) {
          repository { nameWithOwner }
        }
      }
    `;
    await graphqlRequest(linkMutation, {
      projectId: newProject.id,
      repositoryId: repository.id
    });
    console.log(`   🔗 Successfully linked Project Board to ${repository.nameWithOwner}`);

    // Save to local .env if present
    if (fs.existsSync('.env')) {
      let envContent = fs.readFileSync('.env', 'utf8');
      if (envContent.includes('PROJECT_BOARD_ID=')) {
        envContent = envContent.replace(/PROJECT_BOARD_ID=.*/, `PROJECT_BOARD_ID=${newProject.id}`);
      } else {
        envContent += `\nPROJECT_BOARD_ID=${newProject.id}\n`;
      }
      fs.writeFileSync('.env', envContent);
      console.log('   💾 Updated .env with new PROJECT_BOARD_ID');
    }
  }

  console.log('\n🎉 Repository & Project Board setup complete!');
  console.log('========================================================================');
  if (newProject) {
    console.log(` Board URL       : ${newProject.url}`);
    console.log(` PROJECT_BOARD_ID: ${newProject.id}`);
  }
  console.log(` Target Repo     : ${owner}/${repo}`);
  console.log('========================================================================');
}

main().catch(err => {
  console.error('❌ Error initializing repository:', err);
  process.exit(1);
});

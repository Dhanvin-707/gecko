import { Octokit } from '@octokit/rest'

const octokit = new Octokit()

export async function getRepoMetadata(owner: string, name: string) {
  const { data } = await octokit.repos.get({ owner, repo: name })
  return {
    default_branch: data.default_branch,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    open_issues: data.open_issues_count,
    html_url: data.html_url,
    topics: data.topics ?? [],
  }
}

export async function getRecentCommits(owner: string, name: string, branch: string, limit = 10) {
  const { data } = await octokit.repos.listCommits({
    owner,
    repo: name,
    sha: branch,
    per_page: limit,
  })
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message.split('\n')[0],
    author: c.commit.author?.name ?? 'unknown',
    date: c.commit.author?.date ?? '',
    url: c.html_url,
  }))
}

export async function getOpenPullRequests(owner: string, name: string) {
  const { data } = await octokit.pulls.list({
    owner,
    repo: name,
    state: 'open',
    per_page: 20,
  })
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    user: pr.user?.login ?? 'unknown',
    draft: pr.draft ?? false,
    created_at: pr.created_at,
  }))
}

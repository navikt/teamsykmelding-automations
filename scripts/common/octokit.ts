import { Octokit } from 'octokit'

if (!Bun.env.READER_TOKEN) {
    console.error('READER_TOKEN is not set')
    process.exit(1)
}

export const octokit = new Octokit({
    auth: Bun.env.READER_TOKEN,
})

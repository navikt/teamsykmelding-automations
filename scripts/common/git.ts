import fs from 'node:fs'
import path from 'node:path'
import simpleGit, { CleanOptions, ResetMode, SimpleGit } from 'simple-git'

export const GIT_DIR = path.join(process.cwd(), '.git-cache')

fs.mkdirSync(GIT_DIR, { recursive: true })
const git = simpleGit({
    baseDir: GIT_DIR,
    binary: 'git',
    maxConcurrentProcesses: 10,
})

export async function cloneOrPull(repo: string): Promise<void> {
    await (exists(repo) ? pull(repo) : clone(repo))
}

export function createRepoGitClient(repo: string): SimpleGit {
    return simpleGit({
        baseDir: `${GIT_DIR}/${repo}`,
        binary: 'git',
        maxConcurrentProcesses: 1,
        config: [
            'user.email="github-actions[bot]@users.noreply.github.com"',
            'user.name="teamsykmelding-automations[bot]"',
        ],
    })
}

async function pull(repo: string) {
    const t1 = performance.now()
    await createRepoGitClient(repo).reset(ResetMode.HARD).clean([CleanOptions.FORCE, CleanOptions.RECURSIVE]).pull({
        '--rebase': null,
    })

    console.info(`${repo}, exists, pulled OK (${Math.round(performance.now() - t1)}ms)`)
}

async function clone(repo: string) {
    const remote = `https://${Bun.env.READER_TOKEN}:x-oauth-basic@github.com/navikt/${repo}`

    const t1 = performance.now()
    await git.clone(remote, repo, { '--depth': 1 })

    console.info(`Cloned ${repo} OK (${Math.round(performance.now() - t1)}ms))`)
}

function exists(repo: string): boolean {
    return fs.existsSync(path.join(GIT_DIR, repo))
}

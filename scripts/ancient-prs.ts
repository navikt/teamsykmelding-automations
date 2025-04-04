import * as R from 'remeda'
import { isBefore, parseISO, formatDistanceToNow, subDays } from 'date-fns'
import { nb } from 'date-fns/locale'
import { blacklisted, octokit } from './common/octokit.ts'
import { postBlocks } from './common/slack.ts'

type PrNode = {
    title: string
    updatedAt: string
    permalink: string
    isDraft: boolean
    author: {
        avatarUrl: string
        login: string
    }
}

type RepoNodes = {
    name: string
    isArchived: boolean
    pushedAt: string
    url: string
    pullRequests: {
        nodes: PrNode[]
    }
}

const activePrsQuery = /* GraphQL */ `
    query OurRepos($team: String!) {
        organization(login: "navikt") {
            team(slug: $team) {
                repositories(orderBy: { field: PUSHED_AT, direction: ASC }) {
                    nodes {
                        name
                        isArchived
                        pushedAt
                        url
                        pullRequests(first: 10, orderBy: { field: UPDATED_AT, direction: DESC }, states: OPEN) {
                            nodes {
                                title
                                updatedAt
                                permalink
                                isDraft
                                author {
                                    avatarUrl
                                    login
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

async function getWeekOldPrs(team: string): Promise<Record<string, PrNode[]>> {
    console.info(`Getting repositories for team ${team}`)

    const queryResult = (await octokit.graphql(activePrsQuery, {
        team,
    })) as any

    const aWeekAgo = subDays(new Date(), 7)
    const oldPrs = R.pipe(
        queryResult.organization.team.repositories.nodes as RepoNodes[],
        R.filter((it) => !it.isArchived),
        R.filter(blacklisted),
        R.flatMap((repo) => repo.pullRequests.nodes.map((pr): [string, PrNode] => [repo.name, pr])),
        R.filter(([, pr]) => isBefore(parseISO(pr.updatedAt), aWeekAgo)),
        R.groupBy(([repo]) => repo),
        R.mapValues((value) => value.map((it) => it[1])),
    )

    console.info(`Found ${Object.values(oldPrs).flat().length} PRs older than a week for team ${team}`)

    return oldPrs
}

const [weekOldSykmelding, weekOldTsm] = await Promise.all([getWeekOldPrs('teamsykmelding'), getWeekOldPrs('tsm')])
const weekOldPrs = { ...weekOldSykmelding, ...weekOldTsm }
const count = Object.values(weekOldPrs).flat().length
if (count === 0) {
    console.info('Found no week old pull requests')
    process.exit(0)
}

await postBlocks([
    {
        type: 'header',
        text: {
            type: 'plain_text',
            text: `Det er ${count} PRer som er eldre enn en uke. Kan det merges eller lukkes?`,
            emoji: true,
        },
    },
    ...R.pipe(
        weekOldPrs,
        R.entries(),
        R.flatMap(([repo, prs]) => [
            {
                type: 'header',
                text: { type: 'plain_text', text: `${repo}`, emoji: true },
            },
            ...prs.flatMap((pr) => [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<${pr.permalink}|${pr.isDraft ? 'Draft: ' : ''}${pr.title}> (${formatDistanceToNow(
                            parseISO(pr.updatedAt),
                            {
                                locale: nb,
                            },
                        )} gammel)`,
                    },
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'image',
                            image_url: pr.author.avatarUrl,
                            alt_text: pr.author.login,
                        },
                        {
                            type: 'plain_text',
                            text: `${pr.author.login}`,
                            emoji: true,
                        },
                    ],
                },
            ]),
        ]),
    ),
])

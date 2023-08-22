import * as R from 'remeda'
import { octokit } from './common/octokit.ts'
import { exitWithMessage } from './common/utils.ts'
import { postBlocks } from './common/slack.ts'
import { formatDistanceToNow, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { nb } from 'date-fns/locale'

const valid = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']

function getLevelArgs(): string[] {
    const reportLevelArgs: string[] | null =
        Bun.argv
            .find((it) => it.startsWith('--levels='))
            ?.replace('--levels=', '')
            ?.split(',') ?? null

    if (reportLevelArgs == null) {
        exitWithMessage('No --level argument given, exiting', 1)
    }

    if (reportLevelArgs.some((it) => !valid.includes(it))) {
        exitWithMessage(`Invalid --levels, given: ${reportLevelArgs}, valid: ${valid}`, 1)
    }

    return reportLevelArgs
}

type VulnerabilityNode = {
    state: string
    createdAt: string
    number: number
    securityVulnerability: {
        severity: string
        vulnerableVersionRange: string
        package: {
            ecosystem: string
            name: string
        }
        firstPatchedVersion: {
            identifier: string
        } | null
        advisory: {
            description: string
            id: string
            permalink: string
        }
    }
}

type RepoNodes = {
    name: string
    isArchived: boolean
    pushedAt: string
    url: string
    vulnerabilityAlerts: {
        nodes: VulnerabilityNode[]
    }
}

const allVulnerabilitiesForTeamQuery = /* GraphQL */ `
    query OurRepos($team: String!) {
        organization(login: "navikt") {
            team(slug: $team) {
                repositories {
                    nodes {
                        name
                        isArchived
                        pushedAt
                        url
                        vulnerabilityAlerts(states: OPEN, first: 10) {
                            nodes {
                                state
                                createdAt
                                number
                                securityVulnerability {
                                    vulnerableVersionRange
                                    severity
                                    package {
                                        ecosystem
                                        name
                                    }
                                    firstPatchedVersion {
                                        identifier
                                    }
                                    advisory {
                                        description
                                        id
                                        permalink
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

async function getVulnerabilities(team: string, levels: string[]) {
    const queryResult = (await octokit.graphql(allVulnerabilitiesForTeamQuery, {
        team,
    })) as any

    return R.pipe(
        queryResult.organization.team.repositories.nodes as RepoNodes[],
        R.filter((it) => !it.isArchived),
        R.filter((it) => it.vulnerabilityAlerts.nodes.length > 0),
        R.flatMap((repo) =>
            repo.vulnerabilityAlerts.nodes.map((alert) => ({
                name: repo.name,
                url: repo.url,
                vulnerability: alert,
            })),
        ),
        R.filter((it) => levels.includes(it.vulnerability.securityVulnerability.severity)),
        R.groupBy((it) => it.vulnerability.securityVulnerability.severity),
        R.mapValues((it) => R.groupBy(it, (it) => it.name)),
    )
}

function vulnSlackLine({ vulnerability, url }: { vulnerability: VulnerabilityNode; url: string }) {
    const {
        createdAt,
        number,
        securityVulnerability: { package: pkg, vulnerableVersionRange, firstPatchedVersion, advisory, severity },
    } = vulnerability

    return `${pkg.ecosystem}: ${pkg.name}@${vulnerableVersionRange}, ${formatDistanceToNowStrict(parseISO(createdAt), {
        unit: 'day',
        locale: nb,
    })} gammel \n\t\t${
        firstPatchedVersion?.identifier ? `Fixed in *${firstPatchedVersion?.identifier}*` : 'NO FIX'
    } <${url}/security/dependabot/${number}|issue>, <${advisory.permalink}|CVE>`
}

const levels: string[] = getLevelArgs()
const vulnerabilitiesByLevel = await getVulnerabilities('teamsykmelding', levels)

function levelToEmoji(level: string) {
    switch (level) {
        case 'LOW':
            return ':pepe-shrug:'
        case 'MODERATE':
            return ':pepejam:'
        case 'HIGH':
            return ':pepe-drive:'
        case 'CRITICAL':
            return ':wide_eye_pepe:'
        default:
            return ''
    }
}

if (!R.isEmpty(vulnerabilitiesByLevel)) {
    await postBlocks(
        R.pipe(
            vulnerabilitiesByLevel,
            R.toPairs,
            R.flatMap(([level, apps]) => [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `Sårbarheter på nivå ${level} ${levelToEmoji(level)}`,
                        emoji: true,
                    },
                },
                ...R.pipe(
                    apps,
                    R.toPairs,
                    R.flatMap(([app, vulns]) => [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `*${app}*`,
                            },
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: vulns.map(vulnSlackLine).join('\n'),
                            },
                        },
                    ]),
                ),
            ]),
        ),
    )
} else {
    await postBlocks([
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:cool_pepe: Ingen sårbarheter funnet på nivåene i dag ${levels.join(', ')} :cool_pepe:`,
            },
        },
    ])
}

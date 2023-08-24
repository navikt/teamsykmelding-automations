import 'cronstrue/locales/nb'

import * as R from 'remeda'
import { load } from 'js-yaml'
import cronstrue from 'cronstrue'

import path from 'node:path'
import { glob } from 'glob'

const readmeMarkersRegex =
    /<!-- COMPUTER SAYS DON'T TOUCH THIS START -->[\s\S]*?<!-- COMPUTER SAYS DON'T TOUCH THIS END -->/g

const files = await glob(path.join(process.cwd(), '.github/**/*.y*ml'), {
    dot: true,
})

const yamls = (await Promise.all(files.map((it) => Bun.file(it).text().then(load)))) as {
    name: string
    on: { schedule: { cron: string }[] } | undefined
}[]

const whatToWhenTuple = R.pipe(
    yamls,
    R.filter((it) => it?.on?.schedule != null),
    R.map((it) => [it.name, it?.on?.schedule?.at(0)?.cron] as unknown as [string, string]),
    R.map(([name, cron]) => [
        name,
        cronstrue.toString(cron, { locale: 'nb', use24HourTimeFormat: true, verbose: true }),
    ]),
    R.sortBy(([what]) => what),
)

const readmeFile = Bun.file(path.join(process.cwd(), 'README.md'))
const originalFileContent = await readmeFile.text()
const newContent = `<!-- COMPUTER SAYS DON'T TOUCH THIS START -->

${whatToWhenTuple.map(([name, when]) => `- **${name}** | ${when}`).join('\n')}

<!-- COMPUTER SAYS DON'T TOUCH THIS END -->`
await Bun.write(readmeFile, originalFileContent.replace(readmeMarkersRegex, newContent))

console.log('Updated README.md with cron schedule')

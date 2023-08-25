import * as R from 'remeda'

export async function getLatestDigestHash(image: string): Promise<string> {
    const process = Bun.spawnSync(['docker', 'manifest', 'inspect', `${image}:latest`])
    const manifest = R.pipe(
        process,
        (it): any[] => JSON.parse(it.stdout.toString()).manifests,
        R.find((it) => it.platform.architecture === 'amd64'),
    )

    if (manifest == null) {
        throw new Error(`No manifest found: ${process.stderr?.toString() ?? 'No error'}`)
    }

    return manifest.digest
}

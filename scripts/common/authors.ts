export type Author = [name: string, email: string, user: string]

const authorOptions: Author[] = [
    ['Karl O', 'k@rl.run', 'karl-run'],
    ['Andreas', 'danduras@gmail.com', 'andreasDev'],
    ['Natalie Uranes', 'natalie.uranes@gmail.com', 'nuranes'],
    ['Joakim Taule Kartveit', 'joakimkartveit@gmail.com', 'MikAoJk'],
    ['Helene Arnesen', 'helene.arnesen@nav.no', 'helehar'],
    ['Jørn-Are Flaten', 'ja.flaten91@gmail.com', 'jaflaten'],
    ['Lene Tillerli Omdal', 'lene.omdal@hotmail.com', 'leneomdal'],
    ['Hein Haraldsen', 'hein.haraldsen@bekk.no', 'heinharaldsen'],
]

export function getAuthor(username: string | null): Author | null {
    if (username == null) return null

    return authorOptions.find(([, , user]) => user.toLowerCase() === username.toLowerCase()) ?? null
}

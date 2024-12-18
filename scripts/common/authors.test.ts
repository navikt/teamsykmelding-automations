import { test, expect } from 'bun:test'
import { getAuthor } from './authors.ts'

test('get user', () => {
    expect(getAuthor('karl-run')).toEqual(['Karl O', 'k@rl.run', 'karl-run'])
})

import { test, expect } from 'bun:test'
import { getFrontendBumperForOddWeeksOnly } from './bumper'
import { setISOWeek } from 'date-fns'

const thisYear = new Date(2023, 0, 1)

test.each([
    [1, 'nuranes'],
    [2, null],
    [3, 'karl-run'],
    [4, null],
    [5, 'nuranes'],
    [6, null],
    [7, 'karl-run'],
    [8, null],
    [9, 'nuranes'],
    [10, null],
    [11, 'karl-run'],
    [12, null],
])(`bumper for week %i should be %o`, (week, expected) => {
    const bumper = getFrontendBumperForOddWeeksOnly(setISOWeek(thisYear, +week))

    expect(bumper).toEqual(expected)
})

import { getISOWeek } from 'date-fns'

const bumpers = ['nuranes', 'karl-run']

export function getFrontendBumperForOddWeeksOnly(date: Date): string | null {
    const weekNumber = getISOWeek(date)

    if (weekNumber % 2 === 0) {
        return null
    }

    return bumpers[((weekNumber - 1) / 2) % bumpers.length]
}

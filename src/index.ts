import { Temporal } from "@js-temporal/polyfill"

const FORMATS: Record<keyof Temporal.DurationLike, string[]> = {
    years: ["years", "year", "y", "年後", "年"],
    months: ["months", "month", "mo", "M", "ヵ月後", "ヵ月"],
    weeks: ["weeks", "week", "w", "週間後", "週間", "週"],
    days: ["days", "day", "d", "日後", "日間", "日"],
    hours: ["hours", "hour", "hr", "h", "時間後", "時間"],
    minutes: ["minutes", "minute", "mins", "min", "m", "分後", "分間", "分"],
    seconds: ["seconds", "second", "secs", "sec", "s", "秒後", "秒"],
    milliseconds: ["milliseconds", "millisecond", "msecs", "msec", "ms", "ミリ秒後", "ミリ秒"],
    microseconds: ["microseconds", "microsecond", "usecs", "usec", "us", "μs", "マイクロ秒後", "マイクロ秒"],
    nanoseconds: ["nanoseconds", "nanosecond", "nsecs", "nsec", "ns", "ナノ秒後", "ナノ秒"],
}

const KEYS_SORTED = Object.values(FORMATS)
    .flatMap(s => s)
    .sort((a, b) => b.length - a.length)

const FORMAT_REGEX = new RegExp(`(\\d+)\\s*(${KEYS_SORTED.join("|")})`, "gi")

function calc(s: string, timeZone: string = "UTC") {
    const now = Temporal.Now.zonedDateTimeISO(timeZone)
    if (s === "now") {
        return now
    }

    const duration: Record<string, number> = {}

    const matches = s.matchAll(FORMAT_REGEX)

    for (const match of matches) {
        const value = parseInt(match[1], 10)
        const unitKey = match[2].toLowerCase()
        const [targetUnit] = Object.entries(FORMATS).find(([_, v]) => v.includes(unitKey)) ?? []

        if (targetUnit) {
            duration[targetUnit] = (duration[targetUnit] ?? 0) + value
        }
    }
    const result = now.add(duration)
    return result
}

function fmtDate(date: Temporal.ZonedDateTime, locale: string = "ja-JP") {
    return date.toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "medium",
    })
}

function usage(origin: string, timeZone: string, locale: string = "ja-JP"): string {
    const examples = Array.from([
        "now",
        "1h",
        "4h24m",
        "2時間30分",
        "130秒",
        "10days",
        "1mo",
        "2ヵ月",
        // "2100-01-01",
    ]).map(ex => `/${ex}\n  ${fmtDate(calc(ex, timeZone), locale)}\n`)

    let usage = `Usage:
  GET ${origin}/{pattern}

Examples
`
    for (const ex of examples) {
        usage += `  ${ex}\n`
    }

    usage += "Formats\n"
    usage += JSON.stringify(FORMATS, null, 2)
    return usage
}

function getLocale(req: Request, fallback = "ja-JP") {
    const acceptLanguage = req.headers.get("accept-language") ?? fallback
    const timeZone = (req.cf?.timezone as string) ?? "UTC"
    const langs = acceptLanguage.split(",").map(item => item.split(";")[0].trim())

    for (const lang of langs) {
        try {
            if (Intl.DateTimeFormat.supportedLocalesOf(lang).length > 0) {
                return { locale: lang, timeZone }
            }
        } catch {
            continue
        }
    }

    return { locale: fallback, timeZone }
}

const DATE_REGEX =
    /^(?:(\d{4})[-/年])?(\d{1,2})[-/月](\d{1,2})日?(?:[\sT]+(\d{1,2})[:時](\d{1,2})(?:[:分](\d{1,2})秒?)?)?$/

function parseTargetDate(s: string, timeZone: string): Temporal.ZonedDateTime | null {
    try {
        const hasYear = /\b\d{4}\b/.test(s)
        const epochMs = Date.parse(s)
        if (isNaN(epochMs)) {
            throw null
        }

        const instant = Temporal.Instant.fromEpochMilliseconds(epochMs)

        let zoned = instant.toZonedDateTimeISO(timeZone)
        if (!hasYear) {
            const now = Temporal.Now.zonedDateTimeISO(timeZone)
            zoned = zoned.with({ year: now.year })
            if (Temporal.PlainDate.compare(zoned.toPlainDate(), now.toPlainDate()) < 0) {
                zoned = zoned.add({ years: 1 })
            }
        }
        return zoned
    } catch {}
    const match = s.trim().match(DATE_REGEX)
    if (!match) return null

    try {
        const now = Temporal.Now.zonedDateTimeISO(timeZone)

        const hasYear = Boolean(match[1])
        const year = hasYear ? parseInt(match[1], 10) : now.year
        const month = parseInt(match[2], 10)
        const day = parseInt(match[3], 10)
        const hour = match[4] ? parseInt(match[4], 10) : 0
        const minute = match[5] ? parseInt(match[5], 10) : 0
        const second = match[6] ? parseInt(match[6], 10) : 0

        let target = Temporal.ZonedDateTime.from({
            year,
            month,
            day,
            hour,
            minute,
            second,
            timeZone,
        })

        if (!hasYear && Temporal.ZonedDateTime.compare(target, now) < 0) {
            target = target.add({ years: 1 })
        }

        return target
    } catch {
        return null
    }
}

function response(data: string) {
    return new Response(data, {
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
        },
    })
}

function main(req: Request) {
    const { locale, timeZone } = getLocale(req)
    const url = new URL(req.url)
    const rawPath = url.pathname.slice(1)
    if (!rawPath) {
        return response(usage(url.origin, timeZone, locale))
    }

    let path = ""
    try {
        path = decodeURIComponent(rawPath)
    } catch {
        path = rawPath
    }

    const targetDate = parseTargetDate(path, timeZone)
    if (targetDate) {
        const now = Temporal.Now.zonedDateTimeISO(timeZone)
        const diff = now.until(targetDate, { largestUnit: "year" })

        return response(diff.toLocaleString(locale))
    }

    if (path.toLowerCase() === "now") {
        const now = Temporal.Now.zonedDateTimeISO(timeZone)
        return response(fmtDate(now, locale))
    }

    const result = fmtDate(calc(path, timeZone), locale)
    return response(result)
}

export default {
    fetch(req: Request) {
        let url = new URL(req.url)
        const ignored = new Set(["/favicon.ico", "/robots.txt", "/apple-touch-icon.png"])
        if (ignored.has(url.pathname)) {
            return new Response(null, {
                status: 204,
                headers: { "Cache-Control": "public, max-age=86400" },
            })
        }

        try {
            return main(req)
        } catch (e: any) {
            console.error(e)
            const { locale, timeZone } = getLocale(req)
            return response(usage(url.origin, timeZone, locale))
        }
    },
} satisfies ExportedHandler

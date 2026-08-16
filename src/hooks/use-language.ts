"use client"

// Tiny language toggle for EN ↔ AR. Stores the choice in localStorage and
// toggles `document.documentElement.dir` to "rtl" when Arabic is active.
// Also exposes a translations dictionary used by the navbar / player.
//
// This is intentionally lightweight (no i18n framework) — we only translate
// the handful of labels that matter on mobile.

import { useCallback, useEffect, useState } from "react"

export type Lang = "en" | "ar"

const KEY = "netstream:lang"

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    home: "Home",
    series: "Series",
    movies: "Movies",
    arabic: "Arabic",
    mylist: "My List",
    search: "Search",
    playImdb: "Play IMDB",
    server: "Server",
    quality: "Quality",
    season: "Season",
    reload: "Reload stream",
    test: "Test",
    pip: "PiP",
    download: "Download",
    subtitles: "Subtitles",
    myList: "My List",
    inMyList: "In My List",
    openInTab: "Not playing? Open in tab",
    loading: "Loading",
    playbackTips: "Playback tips",
    primary: "Primary",
    mobile: "Mobile",
    advanced: "Advanced",
    others: "Others",
    continueWatching: "Continue Watching",
    trending: "Trending Now",
    popularMovies: "Popular Movies",
    popularSeries: "Popular Series",
    topRated: "Top Rated",
    libraryBanner: "Explore the full library",
    imdbBanner: "Have an IMDB ID? Stream it instantly.",
    arabicMovies: "Arabic Movies",
    arabicSeries: "Arabic Series",
    // Hero / buttons
    play: "Play",
    moreInfo: "More Info",
    resume: "Resume",
    // Browse page
    moviesLibrary: "Movies",
    tvSeriesLibrary: "TV Series",
    browseAll: "Browse",
    fullLibrary: "Full TMDB library — millions of titles with real posters",
    popular: "Popular",
    nowPlaying: "Now Playing",
    onTheAir: "On The Air",
    all: "All",
    searchLibrary: "Search the full library…",
    scrollForMore: "Scroll for more…",
    reachedEnd: "You've reached the end",
    noTitlesFound: "No titles found",
    noMatches: "No matches found",
    titles: "titles",
    // My List
    yourListEmpty: "Your list is empty",
    yourListEmptyDesc: "Add titles from the home page, or play any IMDB ID directly.",
    searchPlay: "Search & play",
    // Search overlay
    searchPlaceholder: "Search for movies, series…",
    searchAllTitles: "All titles · 11k database",
    playByImdb: "Play by IMDB ID",
    imdbIdPlaceholder: "e.g. tt0111161",
    enterImdbId: "Enter an IMDB ID",
    movie: "Movie",
    seriesType: "Series",
    validate: "Validate",
    clear: "Clear",
    // Footer
    getTheApp: "Get the NetStream App",
    downloadAndroid: "Download for Android (APK)",
    downloadWindows: "Download for Windows (EXE)",
    installPwa: "Install as Web App (PWA)",
    madeWith: "Made with",
    forMovieLovers: "for movie lovers. Streaming via third-party providers.",
    disclaimer: "NetStream does not host any content. All streaming is provided by third-party embeds (vidsrc, 2embed, etc.). For educational use only.",
    // Player
    closePlayer: "Close player",
    ifNothingPlays: "If nothing plays, switch the Server below or click Reload.",
    movieShort: "Movie",
    seriesShort: "Series",
    playbackTipsBody: "the provider is blocking iframe embedding. Fix it by clicking the",
    restrictions: "restrictions. Or switch",
    providersAvailable: "providers available, including",
    mobileOptimized: "mobile-optimized and",
    arabicProviders: "Arabic",
    adWarning: "Some providers show pop-up ads. Use an adblocker (uBlock Origin) for the best experience.",
    // Backup site links (shown at the bottom of the home page)
    backupSites: "Backup Sites",
    backupSitesDesc: "If this site is down, try one of these mirrors",
    // Quality options
    auto: "Auto",
    // Categories
    trendingNow: "Trending Now",
    topRatedMovies: "IMDB Top Movies",
    topRatedSeries: "IMDB Top Series",
    airingThisWeek: "Airing This Week",
    nowPlayingTheaters: "Now Playing in Theaters",
    // Server status
    serverStatus: "Server Status",
    testingServers: "Testing all servers…",
    serversResponding: "servers responding",
    clickToSwitch: "Click a working server to switch instantly",
    retest: "Re-test",
    noServers: "No servers responded. Try again later.",
    // Subtitles
    searchOnline: "Search Online",
    uploadSrt: "Upload .srt",
    searchSubtitles: "Search subtitles…",
    searching: "Searching…",
    noSubtitles: "No subtitles found. Try uploading a .srt file instead.",
    uploadHint: "Upload a .srt subtitle file to display it as an overlay on the video player.",
    clickToSelect: "Click to select .srt file",
    srtSupported: ".srt, .vtt, .ass supported",
    subtitleLoaded: "loaded. The subtitle overlay will appear on the video when playing.",
    subtitlesFrom: "Subtitles from OpenSubtitles.org. Download the .srt file, then use your video player's subtitle feature to load it.",
    // Download
    downloadHelper: "Download",
    downloadVideo: "Download this video",
    downloadTips: "To download, open the stream in a new tab and use a browser extension or right-click → Save video as.",
    downloadBuiltIn: "Built-in Downloader",
    downloadSearching: "Finding downloadable sources…",
    downloadSearchingArabic: "Searching Arabic sites and extracting video…",
    downloadSourcesFound: "downloadable source(s) found",
    downloadNoSources: "No direct download sources found",
    downloadNoSourcesDesc: "This provider uses an encrypted player. Try switching to an Arabic provider (EgyDead) which supports direct download, or use the manual options below.",
    downloadMp4: "Download MP4",
    downloadHls: "Download Video (TS)",
    downloadFile: "Download file",
    downloadHlsNote: "HLS stream — segments are concatenated server-side into a single .ts file playable in VLC, MPV, or converted to MP4 with ffmpeg.",
    downloadQuality: "Quality",
    downloadHost: "Host",
    downloadType: "Type",
    downloadManual: "Manual options",
    downloadCopyUrl: "Copy direct URL",
    downloadOpenTab: "Open in new tab",
    downloadYtDlp: "Use yt-dlp",
    downloadYtDlpHint: "If you have yt-dlp installed, copy the command below to your terminal:",
    downloadDisclaimer: "⚠ Downloading copyrighted content may be illegal in your country. This tool is for personal use of public-domain or freely-distributed content only. You are responsible for complying with your local laws.",
    downloadStarted: "Download started — check your browser downloads.",
    downloadRetry: "Search again",
    // Detail
    cast: "Cast & Crew",
    trailer: "Trailer",
    moreLikeThis: "More Like This",
    seasons: "Seasons",
    episodes: "Episodes",
    overview: "Overview",
    rating: "Rating",
    runtime: "Runtime",
    year: "Year",
    genres: "Genres",
    type: "Type",
    // IMDB dialog
    validImdb: "Valid",
    invalidImdb: "Invalid IMDB ID",
    inCatalog: "In catalog",
    notInCatalog: "Not in catalog — will fetch metadata on play",
    playNow: "Play Now",
    // Misc
    toggleLanguage: "Toggle language",
    notifications: "Notifications",
    downloadApp: "Download App",
    netstreamHome: "NetStream home",
    exploreLibrary: "Explore the full library — 11,000 titles",
    exploreLibraryDesc: "Browse the best 10,000 movies and 1,000 series from the IMDb database. Search, filter, and stream any title instantly.",
    openPlayer: "Open player",
    haveImdbId: "Have an IMDB ID? Stream it instantly.",
    haveImdbIdDesc: "Paste any movie or series IMDB ID (like",
    andPlayIt: ") and play it through the vidsrc player. Switch sources and pick episodes for series.",
  },
  ar: {
    home: "الرئيسية",
    series: "مسلسلات",
    movies: "أفلام",
    arabic: "عربي",
    mylist: "قائمتي",
    search: "بحث",
    playImdb: "تشغيل IMDB",
    server: "الخادم",
    quality: "الجودة",
    season: "الموسم",
    reload: "إعادة التحميل",
    test: "فحص",
    pip: "نافذة عائمة",
    download: "تحميل",
    subtitles: "الترجمة",
    myList: "إضافة لقائمتي",
    inMyList: "في قائمتي",
    openInTab: "لا يعمل؟ افتح في تبويب",
    loading: "جارٍ التحميل",
    playbackTips: "نصائح التشغيل",
    primary: "رئيسي",
    mobile: "موبايل",
    advanced: "متقدم",
    others: "أخرى",
    continueWatching: "تابع المشاهدة",
    trending: "الرائج الآن",
    popularMovies: "أفلام شائعة",
    popularSeries: "مسلسلات شائعة",
    topRated: "الأعلى تقييماً",
    libraryBanner: "استكشف المكتبة الكاملة",
    imdbBanner: "لديك معرّف IMDB؟ شاهده فوراً.",
    arabicMovies: "أفلام عربية",
    arabicSeries: "مسلسلات عربية",
    // Hero / buttons
    play: "تشغيل",
    moreInfo: "مزيد من المعلومات",
    resume: "متابعة",
    // Browse page
    moviesLibrary: "أفلام",
    tvSeriesLibrary: "مسلسلات تلفزيونية",
    browseAll: "تصفح",
    fullLibrary: "مكتبة TMDB الكاملة — ملايين العناوين بصور حقيقية",
    popular: "شائع",
    nowPlaying: "يُعرض الآن",
    onTheAir: "يبث حالياً",
    all: "الكل",
    searchLibrary: "ابحث في المكتبة الكاملة…",
    scrollForMore: "مرر للمزيد…",
    reachedEnd: "لقد وصلت إلى النهاية",
    noTitlesFound: "لم يتم العثور على عناوين",
    noMatches: "لا توجد نتائج مطابقة",
    titles: "عنوان",
    // My List
    yourListEmpty: "قائمتك فارغة",
    yourListEmptyDesc: "أضف عناوين من الصفحة الرئيسية، أو شغّل أي معرّف IMDB مباشرة.",
    searchPlay: "ابحث وشغّل",
    // Search overlay
    searchPlaceholder: "ابحث عن أفلام، مسلسلات…",
    searchAllTitles: "جميع العناوين · قاعدة 11 ألف",
    playByImdb: "تشغيل بمعرّف IMDB",
    imdbIdPlaceholder: "مثال: tt0111161",
    enterImdbId: "أدخل معرّف IMDB",
    movie: "فيلم",
    seriesType: "مسلسل",
    validate: "تحقق",
    clear: "مسح",
    // Footer
    getTheApp: "احصل على تطبيق NetStream",
    downloadAndroid: "تحميل لأندرويد (APK)",
    downloadWindows: "تحميل لويندوز (EXE)",
    installPwa: "تثبيت كتطبيق ويب (PWA)",
    madeWith: "صُنع بـ",
    forMovieLovers: "لمحبي الأفلام. البث عبر مزودين خارجيين.",
    disclaimer: "NetStream لا يستضيف أي محتوى. كل البث مقدم من مزودين خارجيين (vidsrc، 2embed، إلخ). للاستخدام التعليمي فقط.",
    // Player
    closePlayer: "إغلاق المشغل",
    ifNothingPlays: "إذا لم يعمل شيء، بدّل الخادم أدناه أو اضغط إعادة التحميل.",
    movieShort: "فيلم",
    seriesShort: "مسلسل",
    playbackTipsBody: "المزود يحظر تضمين iframe. أصلحه بالضغط على",
    restrictions: "القيود. أو بدّل",
    providersAvailable: "مزود متاح، بما في ذلك",
    mobileOptimized: "مزود للجوال و",
    arabicProviders: "عربي",
    adWarning: "بعض المزودين يعرضون إعلانات منبثقة. استخدم مانع إعلانات (uBlock Origin) للحصول على أفضل تجربة.",
    // Backup site links (shown at the bottom of the home page)
    backupSites: "مواقع احتياطية",
    backupSitesDesc: "إذا كان هذا الموقع معطلاً، جرب أحد هذه الروابط البديلة",
    // Quality options
    auto: "تلقائي",
    // Categories
    trendingNow: "الرائج الآن",
    topRatedMovies: "أفضل أفلام IMDB",
    topRatedSeries: "أفضل مسلسلات IMDB",
    airingThisWeek: "يبث هذا الأسبوع",
    nowPlayingTheaters: "يُعرض في دور السينما",
    // Server status
    serverStatus: "حالة الخوادم",
    testingServers: "جارٍ فحص جميع الخوادم…",
    serversResponding: "خوادم تستجيب",
    clickToSwitch: "اضغط على خادم يعمل للتبديل فوراً",
    retest: "إعادة الفحص",
    noServers: "لم يستجب أي خادم. حاول لاحقاً.",
    // Subtitles
    searchOnline: "بحث عبر الإنترنت",
    uploadSrt: "رفع .srt",
    searchSubtitles: "ابحث عن ترجمات…",
    searching: "جارٍ البحث…",
    noSubtitles: "لم يتم العثور على ترجمات. حاول رفع ملف .srt بدلاً من ذلك.",
    uploadHint: "ارفع ملف ترجمة .srt لعرضه كطبقة فوق مشغل الفيديو.",
    clickToSelect: "اضغط لاختيار ملف .srt",
    srtSupported: "يدعم .srt، .vtt، .ass",
    subtitleLoaded: "تم التحميل. ستظهر الترجمة على الفيديو عند التشغيل.",
    subtitlesFrom: "ترجمات من OpenSubtitles.org. نزّل ملف .srt، ثم استخدم ميزة الترجمة في مشغل الفيديو لتحميله.",
    // Download
    downloadHelper: "تحميل",
    downloadVideo: "تحميل هذا الفيديو",
    downloadTips: "للتحميل، افتح البث في تبويب جديد واستخدم إضافة متصفح أو انقر يميناً → حفظ الفيديو باسم.",
    downloadBuiltIn: "التحميل المدمج",
    downloadSearching: "جارٍ البحث عن مصادر قابلة للتحميل…",
    downloadSearchingArabic: "جارٍ البحث في المواقع العربية واستخراج الفيديو…",
    downloadSourcesFound: "مصدر قابل للتحميل",
    downloadNoSources: "لم يتم العثور على مصادر تحميل مباشرة",
    downloadNoSourcesDesc: "هذا المزود يستخدم مشفّر مشغل. جرّب التبديل إلى مزود عربي (EgyDead) الذي يدعم التحميل المباشر، أو استخدم الخيارات اليدوية أدناه.",
    downloadMp4: "تحميل MP4",
    downloadHls: "تحميل الفيديو (TS)",
    downloadFile: "تحميل الملف",
    downloadHlsNote: "بث HLS — يتم دمج المقاطع على الخادم في ملف .ts واحد قابل للتشغيل في VLC أو MPV، أو تحويله إلى MP4 باستخدام ffmpeg.",
    downloadQuality: "الجودة",
    downloadHost: "المضيف",
    downloadType: "النوع",
    downloadManual: "خيارات يدوية",
    downloadCopyUrl: "نسخ الرابط المباشر",
    downloadOpenTab: "فتح في تبويب جديد",
    downloadYtDlp: "استخدام yt-dlp",
    downloadYtDlpHint: "إذا كان لديك yt-dlp مثبت، انسخ الأمر التالي إلى الطرفية:",
    downloadDisclaimer: "⚠ تحميل المحتوى المحمي بحقوق الملكية قد يكون غير قانوني في بلدك. هذه الأداة للاستخدام الشخصي للمحتوى العام أو الموزع بحرية فقط. أنت مسؤول عن الامتثال لقوانين بلدك.",
    downloadStarted: "بدأ التحميل — تحقق من تنزيلات المتصفح.",
    downloadRetry: "البحث مرة أخرى",
    // Detail
    cast: "طاقم العمل",
    trailer: "الإعلان",
    moreLikeThis: "المزيد مثل هذا",
    seasons: "المواسم",
    episodes: "الحلقات",
    overview: "نظرة عامة",
    rating: "التقييم",
    runtime: "المدة",
    year: "السنة",
    genres: "الأنواع",
    type: "النوع",
    // IMDB dialog
    validImdb: "صالح",
    invalidImdb: "معرّف IMDB غير صالح",
    inCatalog: "في الكتالوج",
    notInCatalog: "غير موجود في الكتالوج — سيتم جلب البيانات عند التشغيل",
    playNow: "شغّل الآن",
    // Misc
    toggleLanguage: "تبديل اللغة",
    notifications: "الإشعارات",
    downloadApp: "تحميل التطبيق",
    netstreamHome: "الصفحة الرئيسية لـ NetStream",
    exploreLibrary: "استكشف المكتبة الكاملة — 11,000 عنوان",
    exploreLibraryDesc: "تصفح أفضل 10,000 فيلم و 1,000 مسلسل من قاعدة بيانات IMDb. ابحث، صفِّ، وشغّل أي عنوان فوراً.",
    openPlayer: "افتح المشغل",
    haveImdbId: "لديك معرّف IMDB؟ شاهده فوراً.",
    haveImdbIdDesc: "الصق أي معرّف IMDB لفيلم أو مسلسل (مثل",
    andPlayIt: ") وشغّله عبر مشغل vidsrc. بدّل المصادر واختر الحلقات للمسلسلات.",
  },
}

export function useLanguage() {
  // Always start with "en" so SSR and first client render match.
  // Then read from localStorage in a useEffect (after hydration) to avoid
  // hydration mismatch errors.
  const [lang, setLang] = useState<Lang>("en")
  // Track whether we've loaded the saved language — prevents the persist
  // effect from overwriting localStorage with "en" before we've read the
  // saved value.
  const [loaded, setLoaded] = useState(false)

  // After hydration: read saved language from localStorage
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const stored = window.localStorage.getItem(KEY) as Lang | null
        if (stored === "ar" || stored === "en") {
          setLang(stored)
        }
      } catch {}
      setLoaded(true)
    })
  }, [])

  // Sync <html dir> + persist whenever lang changes.
  // Skip persisting on the first render (before we've read the saved value)
  // so we don't overwrite the user's saved language with "en".
  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"
    document.documentElement.lang = lang
    if (loaded) {
      try {
        window.localStorage.setItem(KEY, lang)
      } catch {}
    }
  }, [lang, loaded])

  const toggle = useCallback(() => {
    setLang((l) => (l === "en" ? "ar" : "en"))
  }, [])

  const t = useCallback(
    (key: string): string => DICT[lang][key] ?? DICT.en[key] ?? key,
    [lang]
  )

  return { lang, setLang, toggle, t, isArabic: lang === "ar" }
}

"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Play, Info, Star } from "lucide-react"
import type { Title } from "@/lib/movies-data"
import { Poster } from "./poster"

type Props = {
  titles: Title[]
  onPlay: (t: Title) => void
  onInfo?: (t: Title) => void
}

export function Hero({ titles, onPlay, onInfo }: Props) {
  const [idx, setIdx] = useState(0)
  const current = titles[idx]

  useEffect(() => {
    if (titles.length <= 1) return
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % titles.length)
    }, 8000)
    return () => clearInterval(id)
  }, [titles.length])

  if (!current) return null

  return (
    <section className="relative h-[78vh] min-h-[520px] w-full overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={current.imdbId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          className="absolute inset-0"
        >
          <BackdropOrPoster title={current} />
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlays */}
      <div className="absolute inset-0 hero-fade-left" />
      <div className="absolute inset-0 hero-fade-bottom" />

      {/* Content */}
      <div className="relative z-10 flex h-full max-w-xl flex-col justify-end px-4 pb-20 sm:px-8 sm:pb-24 md:max-w-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.imdbId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="mb-3 inline-block rounded bg-primary/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
              {current.type === "series" ? "Netflix Series" : "Netflix Film"}
            </span>
            <h1 className="text-3xl font-black leading-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl">
              {current.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
              {current.rating ? (
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {current.rating}
                </span>
              ) : null}
              <span>{current.year}</span>
              {current.genre.slice(0, 2).map((g) => (
                <span key={g} className="text-white/80">
                  {g}
                </span>
              ))}
            </div>
            <p className="mt-3 line-clamp-3 max-w-lg text-sm text-white/85 drop-shadow sm:text-base">
              {current.overview}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onPlay(current)}
                className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:bg-white/80 sm:px-8 sm:py-3 sm:text-base"
              >
                <Play className="h-5 w-5 fill-black" />
                Play
              </button>
              {onInfo ? (
                <button
                  onClick={() => onInfo(current)}
                  className="inline-flex items-center gap-2 rounded-md bg-white/20 px-6 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/30 sm:px-8 sm:py-3 sm:text-base"
                >
                  <Info className="h-5 w-5" />
                  More Info
                </button>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots */}
      {titles.length > 1 ? (
        <div className="absolute bottom-8 right-4 z-10 flex gap-2 sm:right-8">
          {titles.map((t, i) => (
            <button
              key={t.imdbId}
              onClick={() => setIdx(i)}
              aria-label={`Show ${t.title}`}
              className={
                i === idx
                  ? "h-1.5 w-7 rounded-full bg-primary transition-all"
                  : "h-1.5 w-3 rounded-full bg-white/40 transition-all hover:bg-white/70"
              }
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function BackdropOrPoster({ title }: { title: Title }) {
  // Prefer backdrop image, fall back to poster, fall back to gradient via Poster.
  const [backdropFailed, setBackdropFailed] = useState(false)
  const src = title.backdrop && !backdropFailed ? title.backdrop : title.poster ?? ""

  if (!src) {
    return <Poster title={title.title} year={title.year} className="h-full w-full" />
  }
  return (
    <img
      src={src}
      alt={title.title}
      onError={() => setBackdropFailed(true)}
      className="h-full w-full object-cover object-top"
    />
  )
}

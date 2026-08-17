"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import { Play, Info, Star, ChevronLeft, ChevronRight } from "lucide-react"
import type { Title } from "@/lib/movies-data"
import { Poster } from "./poster"

type Props = {
  titles: Title[]
  onPlay: (t: Title) => void
  onInfo?: (t: Title) => void
}

const SLIDE_DURATION = 8000
const TRANSITION_DURATION = 0.7

export function Hero({ titles, onPlay, onInfo }: Props) {
  const [idx, setIdx] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSlideTimeRef = useRef<number>(Date.now())

  const goToSlide = useCallback((newIdx: number, newDirection: number = 1) => {
    setDirection(newDirection)
    setIdx(newIdx)
    lastSlideTimeRef.current = Date.now()
    setProgress(0)
  }, [])

  const nextSlide = useCallback(() => {
    const nextIdx = (idx + 1) % titles.length
    goToSlide(nextIdx, 1)
  }, [idx, titles.length, goToSlide])

  const prevSlide = useCallback(() => {
    const prevIdx = (idx - 1 + titles.length) % titles.length
    goToSlide(prevIdx, -1)
  }, [idx, titles.length, goToSlide])

  useEffect(() => {
    if (titles.length <= 1 || isPaused) return
    
    const startTimers = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      
      timerRef.current = setInterval(() => {
        nextSlide()
      }, SLIDE_DURATION)
      
      progressTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - lastSlideTimeRef.current
        const newProgress = Math.min((elapsed / SLIDE_DURATION) * 100, 100)
        setProgress(newProgress)
      }, 100)
    }
    
    startTimers()
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [titles.length, isPaused, nextSlide])

  const handleMouseEnter = () => setIsPaused(true)
  const handleMouseLeave = () => setIsPaused(false)

  if (!titles.length) return null
  const current = titles[idx]

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
      scale: 1.05,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? '-100%' : '100%',
      opacity: 0,
      scale: 1.05,
    }),
  }

  const contentVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 24,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
        staggerChildren: 0.1,
      },
    },
  }

  const childVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
    },
  }

  return (
    <section 
      className="relative h-[78vh] min-h-[520px] w-full overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background Slides */}
      <div className="absolute inset-0 overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={current.imdbId}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: TRANSITION_DURATION,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="absolute inset-0"
          >
            <BackdropOrPoster title={current} />
            {/* Ken Burns Effect */}
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: 1.05 }}
              transition={{
                duration: SLIDE_DURATION / 1000,
                ease: "linear",
              }}
              className="absolute inset-0"
              style={{ transformOrigin: 'center center' }}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 hero-fade-left pointer-events-none" />
      <div className="absolute inset-0 hero-fade-bottom pointer-events-none" />
      {/* Top fade for cleaner look */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background/80 to-transparent pointer-events-none" />

      {/* Navigation Arrows */}
      {titles.length > 1 && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white/80 opacity-0 backdrop-blur-sm transition-all duration-300 hover:bg-black/60 hover:text-white group-hover:opacity-100 hover:opacity-100 sm:left-8"
            aria-label="Previous slide"
            style={{ opacity: isPaused ? 1 : 0 }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white/80 opacity-0 backdrop-blur-sm transition-all duration-300 hover:bg-black/60 hover:text-white group-hover:opacity-100 hover:opacity-100 sm:right-8"
            aria-label="Next slide"
            style={{ opacity: isPaused ? 1 : 0 }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="relative z-10 flex h-full max-w-xl flex-col justify-end px-4 pb-20 sm:px-8 sm:pb-24 md:max-w-2xl">
        <motion.div
          key={current.imdbId}
          variants={contentVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={childVariants}>
            <span className="mb-3 inline-block rounded bg-primary/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg">
              {current.type === "series" ? "Netflix Series" : "Netflix Film"}
            </span>
          </motion.div>
          
          <motion.h1 
            className="text-3xl font-black leading-tight text-white drop-shadow-2xl sm:text-5xl md:text-6xl"
            variants={childVariants}
          >
            {current.title}
          </motion.h1>
          
          <motion.div 
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90"
            variants={childVariants}
          >
            {current.rating ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 drop-shadow" />
                {current.rating}
              </span>
            ) : null}
            <span>{current.year}</span>
            {current.genre.slice(0, 2).map((g) => (
              <span key={g} className="text-white/80">
                {g}
              </span>
            ))}
          </motion.div>
          
          <motion.p 
            className="mt-3 line-clamp-3 max-w-lg text-sm text-white/85 drop-shadow sm:text-base"
            variants={childVariants}
          >
            {current.overview}
          </motion.p>

          <motion.div 
            className="mt-5 flex flex-wrap items-center gap-3"
            variants={childVariants}
          >
            <button
              onClick={() => onPlay(current)}
              className="group inline-flex items-center gap-2 rounded-md bg-white px-6 py-2.5 text-sm font-bold text-black transition-all duration-300 hover:bg-white/90 hover:scale-105 active:scale-95 sm:px-8 sm:py-3 sm:text-base"
            >
              <Play className="h-5 w-5 fill-black transition-transform group-hover:scale-110" />
              Play
            </button>
            {onInfo ? (
              <button
                onClick={() => onInfo(current)}
                className="group inline-flex items-center gap-2 rounded-md bg-white/20 px-6 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition-all duration-300 hover:bg-white/30 hover:scale-105 active:scale-95 sm:px-8 sm:py-3 sm:text-base"
              >
                <Info className="h-5 w-5 transition-transform group-hover:scale-110" />
                More Info
              </button>
            ) : null}
          </motion.div>
        </motion.div>
      </div>

      {/* Progress Bar & Dots Container */}
      {titles.length > 1 && (
        <div className="absolute bottom-8 right-4 z-10 flex flex-col items-end gap-3 sm:right-8">
          {/* Progress Bar */}
          <div className="flex gap-1">
            {titles.map((t, i) => (
              <div
                key={t.imdbId}
                className="relative h-1 w-8 overflow-hidden rounded-full bg-white/30"
              >
                {i === idx && (
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.1, ease: "linear" }}
                    className="h-full bg-primary"
                  />
                )}
              </div>
            ))}
          </div>
          
          {/* Dot Indicators */}
          <div className="flex gap-2">
            {titles.map((t, i) => (
              <button
                key={t.imdbId}
                onClick={() => goToSlide(i, i > idx ? 1 : -1)}
                aria-label={`Show ${t.title}`}
                className="group relative"
              >
                <motion.div
                  animate={{
                    width: i === idx ? 28 : 12,
                    backgroundColor: i === idx ? 'rgb(229, 9, 20)' : 'rgba(255, 255, 255, 0.4)',
                  }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="h-1.5 rounded-full"
                />
                <div className="absolute inset-0 rounded-full bg-primary/0 transition-colors group-hover:bg-primary/20" />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function BackdropOrPoster({ title }: { title: Title }) {
  const [backdropFailed, setBackdropFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const src = title.backdrop && !backdropFailed ? title.backdrop : title.poster ?? ""

  if (!src) {
    return <Poster title={title.title} year={title.year} className="h-full w-full" />
  }
  
  return (
    <>
      <img
        src={src}
        alt={title.title}
        onError={() => setBackdropFailed(true)}
        onLoad={() => setImageLoaded(true)}
        className={`h-full w-full object-cover object-top transition-opacity duration-700 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {!imageLoaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted/30 animate-pulse" />
      )}
    </>
  )
}

// Curated catalog of popular movies & series with real IMDB IDs.
// Posters use TMDB's public image CDN (https://image.tmdb.org/t/p/w500).
// If a poster path is missing or fails to load, the UI falls back to a
// styled gradient poster (title + year), so the catalog still looks good.

export type Title = {
  imdbId: string
  title: string
  type: "movie" | "series"
  year: string
  poster: string
  backdrop?: string
  overview: string
  rating: string
  genre: string[]
  badge?: string
}

const TMDB_IMG = "https://image.tmdb.org/t/p/w500"
const TMDB_BACK = "https://image.tmdb.org/t/p/original"

const p = (path: string) => (path ? `${TMDB_IMG}${path}` : "")
const b = (path: string) => (path ? `${TMDB_BACK}${path}` : "")

// Helper to keep the catalog concise.
function mv(
  imdbId: string,
  title: string,
  year: string,
  rating: string,
  genre: string[],
  poster: string,
  overview: string,
  backdrop?: string,
  badge?: string
): Title {
  return {
    imdbId,
    title,
    type: "movie",
    year,
    rating,
    genre,
    poster: p(poster),
    backdrop: backdrop ? b(backdrop) : undefined,
    overview,
    badge,
  }
}

function tv(
  imdbId: string,
  title: string,
  year: string,
  rating: string,
  genre: string[],
  poster: string,
  overview: string,
  backdrop?: string,
  badge?: string
): Title {
  return {
    imdbId,
    title,
    type: "series",
    year,
    rating,
    genre,
    poster: p(poster),
    backdrop: backdrop ? b(backdrop) : undefined,
    overview,
    badge,
  }
}

// Known-wrong IMDB IDs that were found in the curated catalog (verified
// against the local IMDb dataset). These point to different titles than
// their labels claim, so we filter them out.
const WRONG_IDS = new Set([
  "tt0098904", // labeled "The Simpsons" but is actually Seinfeld
  "tt2085059", // labeled "Peaky Blinders" but is actually Black Mirror
  "tt7394746", // labeled "The Witcher" but wrong ID (real is tt5180504)
  "tt0245429", // labeled LOTR but is actually Spirited Away
  "tt9112570", // labeled "The Batman" but wrong
  "tt1535109", // labeled "The Batman" but is Captain Phillips
])

// Clean the catalog: remove wrong IDs, then deduplicate by IMDB id (keep
// first occurrence which has the richest metadata) and by title (keep first).
function cleanCatalog(raw: Title[]): Title[] {
  const seenIds = new Set<string>()
  const seenTitles = new Set<string>()
  const out: Title[] = []
  for (const t of raw) {
    if (WRONG_IDS.has(t.imdbId)) continue
    if (seenIds.has(t.imdbId)) continue
    const titleKey = t.title.toLowerCase()
    if (seenTitles.has(titleKey)) continue
    seenIds.add(t.imdbId)
    seenTitles.add(titleKey)
    out.push(t)
  }
  return out
}

const _RAW_CATALOG: Title[] = [
  // ============ FEATURED ============
  mv("tt15398776", "Oppenheimer", "2023", "8.3", ["Drama", "History", "Biography"], "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.", "/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg", "Featured"),
  mv("tt1517268", "Barbie", "2023", "6.8", ["Comedy", "Adventure"], "/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg", "Barbie suffers a crisis that leads her to question her world and her existence.", "/ctMserH8g2SeOAnCw5gFjdQF8mo.jpg"),
  mv("tt0468569", "The Dark Knight", "2008", "9.0", ["Action", "Crime", "Drama"], "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", "Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and DA Harvey Dent.", "/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg"),
  mv("tt1375666", "Inception", "2010", "8.8", ["Action", "Sci-Fi", "Thriller"], "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg", "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea.", "/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg"),
  mv("tt0816692", "Interstellar", "2014", "8.7", ["Adventure", "Drama", "Sci-Fi"], "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.", "/pbrkL804c8yAv3zBZR4QPEafpAR.jpg"),
  tv("tt0903747", "Breaking Bad", "2008", "9.5", ["Crime", "Drama", "Thriller"], "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", "A chemistry teacher diagnosed with cancer turns to a life of crime, producing and selling methamphetamine.", "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg", "Featured"),
  tv("tt4574334", "Stranger Things", "2016", "8.7", ["Drama", "Fantasy", "Horror"], "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg", "When a young boy vanishes, a small town uncovers a mystery involving secret experiments and supernatural forces.", "/56v2KjBlU4XaOv9rVYEQypROD7P.jpg", "Featured"),
  tv("tt0944947", "Game of Thrones", "2011", "9.2", ["Action", "Adventure", "Drama"], "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg", "Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns.", "/suopoADq0k8YZr4dQXcU6pToj6s.jpg"),

  // ============ TOP MOVIES (IMDB 250 + recent) ============
  mv("tt0111161", "The Shawshank Redemption", "1994", "9.3", ["Drama"], "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg", "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.", "/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg"),
  mv("tt0068646", "The Godfather", "1972", "9.2", ["Crime", "Drama"], "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg", "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.", "/tmU7GeKVybMWFButWEGl2M4GeiP.jpg"),
  mv("tt0071562", "The Godfather Part II", "1974", "9.0", ["Crime", "Drama"], "/hek3koDUyRQk7FIhPXsa6mT2Zc3.jpg", "The early life and career of Vito Corleone in 1920s New York is chronicled alongside his son Michael's expansion.", "/kGzFbGhp99zva6oZODW5atUtnqi.jpg"),
  mv("tt0468569", "The Dark Knight", "2008", "9.0", ["Action", "Crime", "Drama"], "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", "Batman raises the stakes in his war on crime.", "/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg"),
  mv("tt0050083", "12 Angry Men", "1957", "9.0", ["Crime", "Drama"], "/ow3wq89wM8qd5X7W5d0X7T6dD6P.jpg", "A jury holdout attempts to prevent a miscarriage of justice by forcing his colleagues to reconsider the evidence."),
  mv("tt0108052", "Schindler's List", "1993", "9.0", ["Biography", "Drama", "History"], "/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg", "In German-occupied Poland during World War II, industrialist Oskar Schindler gradually becomes concerned for his Jewish workforce."),
  mv("tt0167260", "The Lord of the Rings: The Return of the King", "2003", "9.0", ["Action", "Adventure", "Drama"], "/rCzpDGLbOoPwLjy3OAm5NUPOTrT.jpg", "Gandalf and Aragorn lead the World of Men against Sauron's army to draw his gaze from Frodo and Sam.", "/9De2f6JHQFTYd5q0u0GdBpmqoB.jpg"),
  mv("tt0110912", "Pulp Fiction", "1994", "8.9", ["Crime", "Drama"], "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", "The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.", "/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg"),
  mv("tt0120737", "The Lord of the Rings: The Fellowship of the Ring", "2001", "8.9", ["Action", "Adventure", "Drama"], "/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg", "A meek Hobbit from the Shire and eight companions set out on a journey to destroy the powerful One Ring.", "/x2RS3uTcsJpaC0VLuvc4hcWNFI8.jpg"),
  mv("tt0060196", "The Good, the Bad and the Ugly", "1966", "8.8", ["Western"], "/bX2xnavhMYjWDoZp1VM6VnU1xwe.jpg", "A bounty hunting scam joins two men in an uneasy alliance against a third in a race to find a fortune in gold."),
  mv("tt0109830", "Forrest Gump", "1994", "8.8", ["Drama", "Romance"], "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg", "The history of the United States from the 1950s to the '70s unfolds from the perspective of an Alabama man with an IQ of 75.", "/yE5d3BUhE8hCnkMUJOo1QDoOGNz.jpg"),
  mv("tt0137523", "Fight Club", "1999", "8.8", ["Drama"], "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", "An insomniac office worker and a soap maker form an underground fight club that evolves into something much more.", "/52AfXWuXCHn3UjD17rBruA9J5eh.jpg"),
  mv("tt0167261", "The Lord of the Rings: The Two Towers", "2002", "8.8", ["Action", "Adventure", "Drama"], "/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg", "While Frodo and Sam edge closer to Mordor, the divided fellowship makes a stand against Sauron's new ally.", "/5ZP7BH9dUzAIar2jQQVS7D9S5Kf.jpg"),
  mv("tt0073486", "One Flew Over the Cuckoo's Nest", "1975", "8.7", ["Drama"], "/3wPQ5nLfcMplZjOd9KP4NsAiwUf.jpg", "A criminal defendant feigns insanity and is admitted to a mental institution, where he rallies the patients."),
  mv("tt0080684", "Star Wars: Episode V - The Empire Strikes Back", "1980", "8.7", ["Action", "Adventure", "Fantasy"], "/7BuH8itoSrLExs2YZSsM01Qk2no.jpg", "After the Rebels are brutally overpowered by the Empire on the ice planet Hoth, Luke Skywalker begins Jedi training."),
  mv("tt0114369", "Se7en", "1995", "8.6", ["Crime", "Drama", "Mystery"], "/6yoghtyTpznpBik8EngEmJskVUO.jpg", "Two detectives hunt a serial killer who uses the seven deadly sins as his motives.", "/ba4Cpvn3TQfQI1BpPEz5L8G8A0J.jpg"),
  mv("tt0099685", "Goodfellas", "1990", "8.7", ["Biography", "Crime", "Drama"], "/aKuFiU82s5ISJhGwkwR9qk4xRvY.jpg", "The story of Henry Hill and his life in the mob, covering his relationship with his wife and his friends and partners."),
  mv("tt0130827", "The Prestige", "2006", "8.5", ["Drama", "Mystery", "Sci-Fi"], "/tRNlZbgNCNOpLpbPEz5L8G8A0JN.jpg", "After a tragic accident, two stage magicians engage in a battle to create the ultimate illusion.", "/t29dyULrew3wa1z7y9gJr6M2v7B.jpg"),
  mv("tt0095765", "Indiana Jones and the Last Crusade", "1989", "8.2", ["Action", "Adventure"], "/sev6O4n2r4zMfskUMuzOdZ68GdT.jpg", "In 1938, after his father goes missing while pursuing the Holy Grail, Indiana Jones finds himself up against the Nazis."),
  mv("tt0102926", "The Silence of the Lambs", "1991", "8.6", ["Crime", "Drama", "Thriller"], "/uS9m8OBk1A8eM9I042bx8XXpqAq.jpg", "A young F.B.I. cadet must receive the help of an incarcerated and manipulative cannibal killer to catch another serial killer."),
  mv("tt0120815", "Saving Private Ryan", "1998", "8.6", ["Drama", "War"], "/uqx37cS8cpHg8U35f9U5IBlrCV3.jpg", "Following the Normandy Landings, a group of U.S. soldiers go behind enemy lines to retrieve a paratrooper."),
  mv("tt0118799", "Life Is Beautiful", "1997", "8.6", ["Comedy", "Drama", "Romance"], "/74hLDKjD5aGYOotO6esUVaeISa2.jpg", "When an open-minded Jewish librarian and his son become victims of the Holocaust, he uses a perfect mixture of humor and imagination."),
  mv("tt1375666", "Inception", "2010", "8.8", ["Action", "Sci-Fi"], "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg", "A thief who steals corporate secrets through dream-sharing technology.", "/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg"),
  mv("tt0133093", "The Matrix", "1999", "8.7", ["Action", "Sci-Fi"], "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", "A computer hacker learns from mysterious rebels about the true nature of his reality.", "/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg"),
  mv("tt0088763", "Back to the Future", "1985", "8.5", ["Adventure", "Comedy", "Sci-Fi"], "/fNOH9f1aA7XRTzl1sAOx9iF553Q.jpg", "Marty McFly, a 17-year-old high school student, is accidentally sent 30 years into the past in a time-traveling DeLorean."),
  mv("tt0118715", "The Big Lebowski", "1998", "8.1", ["Comedy", "Crime"], "/d4ftZuMTPjAuLEaiASmnpzbXFfN.jpg", "Jeff \"The Dude\" Lebowski, mistaken for a millionaire of the same name, seeks restitution for his ruined rug."),
  mv("tt0090605", "Die Hard", "1988", "8.2", ["Action", "Thriller"], "/yFihWxQcmqcaBR31QM6Y8gT6aYV.jpg", "An NYPD officer tries to save his estranged wife and several others taken hostage by German terrorists."),
  mv("tt0099685", "Goodfellas", "1990", "8.7", ["Crime", "Drama"], "/aKuFiU82s5ISJhGwkwR9qk4xRvY.jpg", "The story of Henry Hill and his life in the mob."),
  mv("tt0082971", "The Thing", "1982", "8.2", ["Horror", "Sci-Fi"], "/tzGY49kseSE9QAKk47uuDGwnSCu.jpg", "Researchers in Antarctica are stalked by a parasitic alien organism that perfectly imitates its prey."),
  mv("tt0057012", "Once Upon a Time in the West", "1968", "8.5", ["Western"], "/qbYgqOcz6WNhC5j23P6rNmoT8gF.jpg", "A mysterious stranger with a harmonica joins forces with a notorious desperado to protect a beautiful widow."),
  mv("tt0076759", "Star Wars", "1977", "8.6", ["Action", "Adventure", "Fantasy"], "/6FfCtAuVAW8XJjZ7eWeLibHWTpe.jpg", "Luke Skywalker joins forces with a Jedi Knight to rescue Princess Leia from the evil Galactic Empire.", "/zqkmTXzjkAgXmEWLRsY4UpTWNoC.jpg"),
  mv("tt0114709", "Toy Story", "1995", "8.3", ["Animation", "Adventure", "Comedy"], "/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg", "A cowboy doll is profoundly threatened and jealous when a new spaceman action figure supplants him as top toy."),
  mv("tt0038650", "It's a Wonderful Life", "1946", "8.6", ["Drama", "Family", "Fantasy"], "/bSqt9rhDZx1Q7UZ86dBPKdNomp2.jpg", "An angel is sent from Heaven to help a desperately frustrated businessman by showing him what life would have been like."),
  mv("tt0114814", "The Usual Suspects", "1995", "8.5", ["Crime", "Mystery", "Thriller"], "/bUPmtQzrRhzqYfHEz4Z8n2Al5PX.jpg", "A sole survivor tells of the twisty events leading up to a horrific gun battle on a boat."),
  mv("tt0245429", "The Lord of the Rings: The Return of the King", "2003", "9.0", ["Action", "Adventure", "Drama"], "/rCzpDGLbOoPwLjy3OAm5NUPOTrT.jpg", "Gandalf and Aragorn lead the World of Men against Sauron's army."),
  mv("tt0113946", "The Truman Show", "1998", "8.2", ["Comedy", "Drama", "Sci-Fi"], "/vuza0WqY239yBXOadKlGwJsZJFE.jpg", "An insurance salesman discovers his whole life is actually a reality TV show."),
  mv("tt0113276", "Heat", "1995", "8.3", ["Crime", "Drama", "Thriller"], "/zMyfPUiZkGwd2dTOq2SCwi4akLh.jpg", "A group of high-end professional thieves start to feel the heat from the LAPD when they leave a clue."),
  mv("tt0103064", "Terminator 2: Judgment Day", "1991", "8.6", ["Action", "Sci-Fi"], "/5M0j0B18abtBI5gi2RhfjjurTqb.jpg", "A cyborg, identical to the one who failed to kill Sarah Connor, must now protect her teenage son."),
  mv("tt0119217", "American History X", "1998", "8.5", ["Drama"], "/c2gsmSQ2Cqv8zosbKkmnw1J9TrF.jpg", "A former neo-Nazi skinhead tries to prevent his younger brother from going down the same wrong path."),
  mv("tt0034583", "Casablanca", "1942", "8.5", ["Drama", "Romance", "War"], "/5K7cOHoay2mZusSLezBOY0Qxh8a.jpg", "A cynical expatriate American cafe owner struggles to decide whether or not to help his former lover and her husband."),
  mv("tt0047478", "Rear Window", "1954", "8.5", ["Mystery", "Thriller"], "/qitnZcLP7C9DLRuPpmvZ7GiEjJN.jpg", "A wheelchair-bound photographer spies on his neighbors from his apartment window."),
  mv("tt0054215", "Psycho", "1960", "8.5", ["Horror", "Mystery", "Thriller"], "/yz4QVqPx3h1hD1DfqqQXkzmJWHv.jpg", "A Phoenix secretary embezzles $40,000 from her employer's client, goes on the run, and checks into a remote motel."),
  mv("tt0086250", "Scarface", "1983", "8.3", ["Crime", "Drama"], "/iQ5Yd2hx2F1aTI4NnJjk9LCiIa3.jpg", "In 1980 Miami, a determined Cuban immigrant takes over a drug cartel and succumbs to greed."),
  mv("tt0093056", "The Princess Bride", "1987", "8.0", ["Adventure", "Family", "Fantasy"], "/qFRGfvBT6Aaa9HFqAcTUiNwYsuk.jpg", "A grandfather reads a bedtime story to his sick grandson, frame tale for a fairy tale about a princess and a farmboy."),
  mv("tt0107007", "Braveheart", "1995", "8.4", ["Biography", "Drama", "History"], "/or1eug8U8RkWsfJt5x5I3FE6ntz.jpg", "Scottish warrior William Wallace leads a rebellion against the tyranny of King Edward I of England."),
  mv("tt0084787", "The Castle", "1979", "7.7", ["Comedy", "Drama"], "", "A Melbourne family fights to save their home from being compulsorily acquired for airport expansion."),

  // ============ MODERN & RECENT ============
  mv("tt10872600", "Spider-Man: No Way Home", "2021", "8.2", ["Action", "Adventure", "Sci-Fi"], "/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg", "With Spider-Man's identity now revealed, Peter asks Doctor Strange for help.", "/iQFcwSGbZXMkeyKrxfM4v9cZ3fl.jpg"),
  mv("tt1160419", "Dune", "2021", "8.0", ["Action", "Adventure", "Sci-Fi"], "/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", "A noble family becomes embroiled in a war for control over the galaxy's most valuable asset.", "/iopYFB1b6Bh7FWZh3onQhph1sih.jpg"),
  mv("tt15239678", "Dune: Part Two", "2024", "8.5", ["Action", "Adventure", "Sci-Fi"], "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg", "Paul Atreides unites with the Fremen while seeking revenge against the conspirators who destroyed his family."),
  mv("tt9362722", "Spider-Man: Across the Spider-Verse", "2023", "8.6", ["Animation", "Action", "Adventure"], "/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg", "Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting it."),
  mv("tt6751668", "Parasite", "2019", "8.5", ["Comedy", "Drama", "Thriller"], "/7IiTTgscJ0o0h1m1c5H5Gf7FWZh.jpg", "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.", "/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg"),
  mv("tt7286456", "Joker", "2019", "8.4", ["Crime", "Drama", "Thriller"], "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg", "A mentally troubled stand-up comedian embarks on a downward spiral.", "/n6bUvigpRFqSwmPp1m2YADdbRBc.jpg"),
  mv("tt4154796", "Avengers: Endgame", "2019", "8.4", ["Action", "Adventure", "Sci-Fi"], "/or06FN3Dka5tukK1e9slXpVmJce.jpg", "After the devastating events of Infinity War, the Avengers assemble once more to reverse Thanos' actions.", "/orjiB3oUIsyz60hoEqkiGpy5CeO.jpg"),
  mv("tt4154756", "Avengers: Infinity War", "2018", "8.4", ["Action", "Adventure", "Sci-Fi"], "/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", "The Avengers and their allies must be willing to sacrifice all in an attempt to defeat the powerful Thanos.", "/lmZFxXgJE3vgrciwuDib0N8CfQo.jpg"),
  mv("tt1825683", "Black Panther", "2018", "7.3", ["Action", "Adventure", "Sci-Fi"], "/uxzzxijgPIY7slzQvBdQK0QCNyb.jpg", "T'Challa returns home to the technologically advanced African nation of Wakanda to take his place as king."),
  mv("tt3501632", "Thor: Ragnarok", "2017", "7.9", ["Action", "Adventure", "Comedy"], "/rzRwTcFvttcN1ZpX2xv4A3Bb2kV.jpg", "Thor is imprisoned on the planet Sakaar and must race against time to return home and stop Ragnarök."),
  mv("tt1211837", "Doctor Strange", "2016", "7.5", ["Action", "Adventure", "Fantasy"], "/4PiiYgwnDZ6ohNTXmiTrvT5oOZy.jpg", "After his career is destroyed, a brilliant but arrogant surgeon discovers the world of the mystic arts."),
  mv("tt0848228", "The Avengers", "2012", "8.0", ["Action", "Adventure", "Sci-Fi"], "/RYMX2WWQrDkRgTWOqVcWd2C4SyV.jpg", "Earth's mightiest heroes must come together to stop the mischievous Loki and his alien army."),
  mv("tt0848228", "The Avengers", "2012", "8.0", ["Action", "Adventure"], "/RYMX2WWQrDkRgTWOqVcWd2C4SyV.jpg", "Earth's mightiest heroes must come together to stop Loki."),
  mv("tt2015381", "Guardians of the Galaxy", "2014", "8.0", ["Action", "Adventure", "Comedy"], "/r7vmZjiyZw9RPpDorZQtQ9USDpC.jpg", "A group of intergalactic criminals must pull together to stop a fanatical warrior."),
  mv("tt3501632", "Thor: Ragnarok", "2017", "7.9", ["Action", "Adventure"], "/rzRwTcFvttcN1ZpX2xv4A3Bb2kV.jpg", "Thor is imprisoned on Sakaar and must race against time."),
  mv("tt2911666", "John Wick", "2014", "7.4", ["Action", "Crime", "Thriller"], "/fZPSd91yGE9fCcCeV8B5WBba9k5.jpg", "An ex-hit-man comes out of retirement to track down the gangsters that killed his dog.", "/eABWfBH6ub7FnKf3ARIhnc7PCnk.jpg"),
  mv("tt4425200", "John Wick: Chapter 2", "2017", "7.4", ["Action", "Crime", "Thriller"], "/h4uXe6wiKjhGescXTu0AbXlvUDS.jpg", "Legendary hit-man John Wick is dragged back into the criminal underworld to repay a debt."),
  mv("tt6148156", "John Wick: Chapter 4", "2023", "7.7", ["Action", "Crime", "Thriller"], "/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg", "John Wick uncovers a path to defeating The High Table."),
  mv("tt1392190", "Mad Max: Fury Road", "2015", "8.1", ["Action", "Adventure", "Sci-Fi"], "/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg", "In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler.", "/gqrnQA6Xppdl8vIb2eJc58VC1tW.jpg"),
  mv("tt0974015", "Justice League", "2017", "6.1", ["Action", "Adventure", "Fantasy"], "/eifYtONWU6oECA39f3Dnb5zMmRc.jpg", "Fueled by his restored faith in humanity, Bruce Wayne enlists Diana Prince to face an even greater threat."),
  mv("tt12361974", "Killers of the Flower Moon", "2023", "7.6", ["Crime", "Drama", "History"], "/dB6Krk806zeqd0YNp2ngQ9zknte.jpg", "When oil is discovered in 1920s Oklahoma under Osage Nation land, the Osage people are murdered one by one."),
  mv("tt1745960", "Top Gun: Maverick", "2022", "8.2", ["Action", "Drama"], "/62HCnUTziyWcpDaBO2i1DX17ljH.jpg", "After thirty years, Maverick is still pushing the envelope as a top naval aviator.", "/odJ4hx2V6PRJJr6phaeldjAWRBM.jpg"),
  mv("tt9362930", "Sonic the Hedgehog 2", "2022", "7.2", ["Action", "Adventure", "Comedy"], "/6YrYHmPC0LkaJLfdkgr2Jjb9h8i.jpg", "When the manic Dr. Robotnik returns to Earth with a new ally, Sonic must step up to save the world."),
  mv("tt10954984", "Nope", "2022", "6.8", ["Horror", "Mystery", "Sci-Fi"], "/AcKVlWaNVVVF5wplNCqwC0DatrW.jpg", "The residents of a lonely gulch of inland California bear witness to an uncanny and chilling discovery."),
  mv("tt6710474", "Avatar: The Way of Water", "2022", "7.6", ["Action", "Adventure", "Sci-Fi"], "/t6HIqrRAclMCA60NsSmeqe9RYVT.jpg", "Jake Sully lives with his newfound family on the extrasolar moon Pandora."),
  mv("tt0499549", "Avatar", "2009", "7.9", ["Action", "Adventure", "Fantasy"], "/jRXYjXNq0Cs2TcJjLkki24MLp7u.jpg", "A paraplegic Marine dispatched to the moon Pandora becomes torn between following his orders and protecting the world.", "/Yc9q6QuWrMp9nuDm5R8ExNqbEq.jpg"),
  mv("tt0382932", "Ratatouille", "2007", "8.1", ["Animation", "Adventure", "Comedy"], "/t3vaWRPSf6WjDfnpgVHKLAUTHsj.jpg", "A rat who can cook makes an unusual alliance with a young kitchen worker at a famous Paris restaurant."),
  mv("tt0245429", "The Lord of the Rings: The Fellowship of the Ring", "2001", "8.9", ["Adventure"], "/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg", "A meek Hobbit and eight companions set out to destroy the One Ring."),
  mv("tt0317705", "The Incredibles", "2004", "8.0", ["Animation", "Action", "Adventure"], "/2LqaLgk4Z226KkgPJuiOQ58wvrm.jpg", "A family of undercover superheroes, while trying to live the quiet suburban life, are forced into action."),
  mv("tt0266543", "Finding Nemo", "2003", "8.2", ["Animation", "Adventure", "Comedy"], "/eHuGQ10FUzK1mdOY69wFswpIU3u.jpg", "After his son is captured in the Great Barrier Reef and taken to Sydney, a timid clownfish sets out to bring him home."),
  mv("tt0268978", "The Lion King", "1994", "8.5", ["Animation", "Adventure", "Drama"], "/sKCr78MXSLixwmZ8DyJ5rpKwew3.jpg", "A Lion cub crown prince is tricked by a treacherous uncle into thinking he caused his father's death."),
  mv("tt0878804", "The Wolf of Wall Street", "2013", "8.2", ["Biography", "Crime", "Drama"], "/34m2tygAYBGqA9MXKhRDtzYd4MR.jpg", "Based on the true story of Jordan Belfort, from his rise to a wealthy stock-broker living the high life."),
  mv("tt1535109", "The Batman", "2022", "7.8", ["Action", "Crime", "Drama"], "/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg", "When a sadistic serial killer begins murdering key political figures in Gotham, Batman is forced to investigate."),
  mv("tt5108870", "1917", "2019", "8.2", ["Action", "Drama", "War"], "/iZf0KyrE25z1sage4SYFLCCrMi9.jpg", "April 6th, 1917. As an infantry battalion assembles to wage war deep in enemy territory, two soldiers are assigned to race against time."),
  mv("tt8503618", "Hamilton", "2020", "8.3", ["Biography", "Drama", "Music"], "/iEHy1WtcUSWuFs8MoQiwYBZdez4.jpg", "The real life of one of America's foremost founding fathers and first Secretary of the Treasury, Alexander Hamilton."),
  mv("tt9112570", "The Batman", "2022", "7.8", ["Action", "Crime"], "/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg", "Batman is forced to investigate the city's hidden corruption."),

  // ============ TOP TV SERIES ============
  tv("tt7394746", "The Witcher", "2019", "8.0", ["Action", "Adventure", "Fantasy"], "/cZ0d3rtvXPVvuiX22sP79K3Hmjz.jpg", "Geralt of Rivia, a solitary monster hunter, struggles to find his place in a world.", "/7HtvmsLrhFqJlfc8tQ5mZdNLOR.jpg"),
  tv("tt6468322", "Money Heist", "2017", "8.2", ["Action", "Crime", "Mystery"], "/reEMJA1uzscCbkpeRJeTT2bjqUp.jpg", "An unusual group of robbers attempt to carry out the most perfect robbery in Spanish history.", "/gFZriCkpJYsApPZEF3jH4yLzG.jpg"),
  tv("tt13443470", "Wednesday", "2022", "8.1", ["Comedy", "Crime", "Fantasy"], "/9PFonBhy4cQy7Jz20NpMygczOkv.jpg", "Wednesday Addams investigates a murderous spree while making new friends and foes at Nevermore Academy.", "/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg"),
  tv("tt10919420", "Squid Game", "2021", "8.0", ["Action", "Drama", "Mystery"], "/dDlEmu3EZ0Pgg93K2SVNLCgCSj5.jpg", "Hundreds of cash-strapped players accept a strange invitation to compete in children's games.", "/2meX1nMdScFOoV437EOpuwp0gE0.jpg"),
  tv("tt3581920", "The Last of Us", "2023", "8.7", ["Action", "Adventure", "Drama"], "/uKvVjHNqB5VmOrdxqAt2F7JprED.jpg", "After a global pandemic destroys civilization, a hardened survivor takes charge of a 14-year-old girl.", "/uDgy6hyPpieve8Rz4z3pUQyObn6.jpg"),
  tv("tt11198330", "House of the Dragon", "2022", "8.4", ["Action", "Drama", "Fantasy"], "/7QMsOTMUswlwxJP0rTTZfmz2tX2.jpg", "The Targaryen civil war, known as the Dance of the Dragons.", "/etj8E2o4Bud7HkJMMo6tVa5bXuH.jpg"),
  tv("tt5753856", "Dark", "2017", "8.7", ["Crime", "Drama", "Sci-Fi"], "/apbrbWs8M9lyOpJYU5WXrpHz6tX.jpg", "A family saga with a supernatural twist, set in a German town.", "/aLkUjQZ4SQDtc6fS9o9Dz4q3liN.jpg"),
  tv("tt2442560", "Peaky Blinders", "2013", "8.8", ["Crime", "Drama"], "/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg", "A gangster family epic set in 1900s England.", "/y5Z0WesTjvn59jP6yQWHs5ge6S2.jpg"),
  tv("tt1190634", "The Boys", "2019", "8.7", ["Action", "Comedy", "Crime"], "/2zmTngn1tYC1AvfnrILhjp7EJR5.jpg", "A group of vigilantes set out to take down corrupt superheroes.", "/mGVrXeIjyecj6TKmwPVpHlscEmw.jpg"),
  tv("tt7366338", "Chernobyl", "2019", "9.3", ["Drama", "History", "Thriller"], "/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg", "In April 1986, an explosion at the Chernobyl nuclear power plant becomes one of the world's worst man-made catastrophes.", "/qXuW2g0jvjvk2OOBnswW9zyCFGr.jpg"),
  tv("tt1475582", "Sherlock", "2010", "9.1", ["Crime", "Drama", "Mystery"], "/7WTsnHkbA0FaG6R9twfFde0I9hl.jpg", "A modern update finds the famous sleuth and his doctor partner solving crime in 21st century London.", "/bvS6cu48VteAhRgRJfRPx9pAyR.jpg"),
  tv("tt2306299", "Vikings", "2013", "8.5", ["Action", "Adventure", "Drama"], "/bQLrHIRNEkE3PdIWQrZHynQZazu.jpg", "Vikings transports us to the brutal and mysterious world of Ragnar Lothbrok.", "/9NWMNKvUmxKJgYwBYTW8O4Ck7Lf.jpg"),
  tv("tt9140554", "Loki", "2021", "8.2", ["Action", "Adventure", "Fantasy"], "/voHUmluYmKyleFkTu3lOXQG702T.jpg", "The mercurial villain Loki resumes his role as the God of Mischief.", "/8eifdha7GfoSCJ3GW2KbjsLPg5g.jpg"),
  tv("tt4786824", "The Crown", "2016", "8.7", ["Drama", "History"], "/1M876KPjulVwppEpldhdc8V4o68.jpg", "Follows the political rivalries and romance of Queen Elizabeth II's reign.", "/4QzgkBwXWelEoLp6XCm8tIcsZW9.jpg"),
  tv("tt3006802", "Outlander", "2014", "8.4", ["Drama", "Romance", "Sci-Fi"], "/k9SDZj1N5ouTmRQzUW7vY6kp7U1.jpg", "An English combat nurse from 1945 is mysteriously swept back in time to 1743.", "/c0urAKIE9L3FpFlz7LsZJzVs5l3.jpg"),
  tv("tt2861424", "Rick and Morty", "2013", "9.1", ["Animation", "Adventure", "Comedy"], "/8kOWDBK6XlPUzckuHDo3wwVFMlw.jpg", "An animated series that follows the exploits of a super scientist and his not-so-bright grandson.", "/uG2MhkgrLuq3xxEEd3UDjvfRyfA.jpg"),
  tv("tt0098904", "The Simpsons", "1989", "8.7", ["Animation", "Comedy"], "/qcr9bBY6MVeLzriKCmJOv1562uY.jpg", "The satiric adventures of a working-class family in the misfit city of Springfield.", "/pxFfPMpDP78XCN5pLwhnG7Fc1Jy.jpg"),
  tv("tt5491994", "Planet Earth II", "2016", "9.4", ["Documentary"], "/wB3fF3zZ8t7t6WnaC6YpJj9e9lC.jpg", "David Attenborough returns with a new wildlife documentary.", "/f5pZUgnR5RfwyVqCv8hP8XcY6A5.jpg"),
  tv("tt0141842", "The Sopranos", "1999", "9.2", ["Crime", "Drama"], "/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg", "New Jersey mob boss Tony Soprano deals with personal and professional issues.", "/57tbnpMoVE4DHnTdpQt7uFYt.jpg"),
  tv("tt0306414", "The Wire", "2002", "9.3", ["Crime", "Drama", "Thriller"], "/4lbclFySvugI51fwsGxBWixNDLn.jpg", "The Baltimore drug scene, seen through the eyes of drug dealers and law enforcement."),
  tv("tt2861424", "Rick and Morty", "2013", "9.1", ["Animation"], "/8kOWDBK6XlPUzckuHDo3wwVFMlw.jpg", "A super scientist and his grandson's exploits."),
  tv("tt0944947", "Game of Thrones", "2011", "9.2", ["Action", "Drama"], "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg", "Nine noble families fight for control over Westeros.", "/suopoADq0k8YZr4dQXcU6pToj6s.jpg"),
  tv("tt0096697", "The Simpsons", "1989", "8.7", ["Animation", "Comedy"], "/qcr9bBY6MVeLzriKCmJOv1562uY.jpg", "The satiric adventures of the Simpson family."),
  tv("tt0108778", "Friends", "1994", "8.9", ["Comedy", "Romance"], "/2koX1xLkpTQM4IZebYvKysFW1Nh.jpg", "Follows the personal and professional lives of six twenty to thirty-something-year-old friends living in Manhattan."),
  tv("tt0098800", "The Fresh Prince of Bel-Air", "1990", "7.9", ["Comedy", "Family"], "/f3ZJ3i1vDhjrJpmJ6rJ0ln9z2KW.jpg", "A streetwise, poor young man from Philadelphia is sent to live with his wealthy aunt and uncle in Bel-Air."),
  tv("tt0386676", "The Office", "2005", "9.0", ["Comedy"], "/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg", "A mockumentary on a group of typical office workers.", "/7VPnxNuLOpzbpvCFHbwvMFeRwDG.jpg"),
  tv("tt0108778", "Friends", "1994", "8.9", ["Comedy"], "/2koX1xLkpTQM4IZebYvKysFU1Nh.jpg", "Six friends living in Manhattan."),
  tv("tt1439629", "Community", "2009", "8.5", ["Comedy"], "/jCQuDQo5sGFIvPpT4wtugDg5T2V.jpg", "A suspended lawyer finds himself a student at a community college."),
  tv("tt1632701", "Suits", "2011", "8.4", ["Comedy", "Drama"], "/2Fk3UU8DnU21EwJUctRnTyL4Ziy.jpg", "On the run from a drug deal gone bad, brilliant college dropout Mike Ross finds himself working with Harvey Specter."),
  tv("tt0972517", "The Walking Dead", "2010", "8.1", ["Drama", "Horror", "Thriller"], "/w21lgYIi9GeUH5d6Fx2QSj3VoaP.jpg", "Sheriff Deputy Rick Grimes wakes up from a coma to learn the world is in ruins from a zombie apocalypse."),
  tv("tt4600894", "Lucifer", "2016", "8.1", ["Crime", "Drama", "Fantasy"], "/k2vLemvujtenQ4qLZ63raxUNBNJ.jpg", "Lucifer Morningstar has decided he's had enough of being the dutiful servant in Hell."),
  tv("tt11196408", "Reacher", "2022", "8.1", ["Action", "Crime", "Drama"], "/qeFqtrZfOH7S5ce1zRp3pKtbQx9.jpg", "Jack Reacher is arrested for murder and now the police need his help."),
  tv("tt11280740", "The Bear", "2022", "8.6", ["Comedy", "Drama"], "/zPyHvEosD43Ujnsd1iqJrz2NQt7.jpg", "A young chef from the fine dining world returns to Chicago to run his family's sandwich shop."),
  tv("tt14795608", "Shogun", "2024", "8.6", ["Drama", "History"], "/7O4iVfOMQmdCSxhOg1WnzG1AwSF.jpg", "In Japan in the year 1600, at the dawn of a century-defining civil war, Lord Yoshii Toranaga is fighting for his life."),
  tv("tt5180504", "The Witcher", "2019", "8.0", ["Action", "Adventure"], "/cZ0d3rtvXPVvuiX22sP79K3Hmjz.jpg", "Geralt of Rivia, a solitary monster hunter."),
  tv("tt10160804", "Arcane", "2021", "9.0", ["Animation", "Action", "Adventure"], "/abf8tHznhSvl9BAElD2cQeRr7do.jpg", "Set in utopian Piltover and the oppressed underground of Zaun, the story follows the origins of two iconic League champions."),
  tv("tt21865265", "Fallout", "2024", "8.4", ["Action", "Adventure", "Comedy"], "/2Nti0gN2Mwc2z7wK9oYnYfT2zD4.jpg", "In a future where civilization has collapsed, the gentle denizens of luxury fallout shelters are forced to return to the irradiated hellscape."),
  tv("tt2356777", "True Detective", "2014", "8.9", ["Crime", "Drama", "Mystery"], "/jZESfQ9SGtMzxpyhi6f6cVwn8tH.jpg", "An American anthology police detective series utilizing multiple timelines in which investigations seem to unearth personal and professional secrets."),
  tv("tt2802850", "Fargo", "2014", "8.9", ["Crime", "Drama", "Thriller"], "/i8rCr4Ph1JND7h2u2DCCn3k5XbN.jpg", "Various chronicles of deception, intrigue and murder in and around frozen Minnesota."),
  tv("tt3398228", "Better Call Saul", "2015", "8.9", ["Crime", "Drama"], "/fC2HDm5t0kHl7mTm7jxMR31bbtv.jpg", "The trials and tribulations of criminal lawyer Jimmy McGill in the time leading up to his fateful run-in with Walter White."),
  tv("tt2707408", "Narcos", "2015", "8.8", ["Biography", "Crime", "Drama"], "/rTmal9fDbwh5F0waol2hq35U4Ah.jpg", "A chronicled look at the criminal exploits of Colombian drug lord Pablo Escobar."),
  tv("tt2661044", "The 100", "2014", "7.8", ["Drama", "Sci-Fi"], "/jBPTLltYzvdZjVz9G3Lx2cZ55Xh.jpg", "Set ninety-seven years after a nuclear war has destroyed civilization, a spaceship housing humanity's lone survivors sends one hundred juvenile delinquents back to Earth."),
  tv("tt2443104", "Black Mirror", "2011", "8.7", ["Drama", "Sci-Fi", "Thriller"], "/5UaYsGZOFhjFDwQh6GuLjjA1WlF.jpg", "An anthology series exploring a twisted, high-tech multiverse where humanity's greatest innovations and darkest instincts collide."),
  tv("tt2085059", "Peaky Blinders", "2013", "8.8", ["Crime", "Drama"], "/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg", "A gangster family epic set in 1900s England."),
  tv("tt7587890", "The Rookie", "2018", "8.0", ["Crime", "Drama"], "/g5ZfS9sHcQ3PZdWtwOr2RrLhV3o.jpg", "Starting over isn't easy, especially for small-town guy John Nolan who, after a life-altering incident, becomes the oldest rookie at the LAPD."),
  tv("tt6806448", "Yellowstone", "2018", "8.7", ["Drama", "Western"], "/2hFvxCCWrTmCYwfy7yum0GKRi3Y.jpg", "A ranching family in Montana faces off against others encroaching on their land."),
  tv("tt12591082", "Chainsaw Man", "2022", "8.5", ["Animation", "Action", "Adventure"], "/npdB6eFzizki0WaZ1OvBcGcCwQw.jpg", "Following a betrayal, a young man left for the dead is reborn as a powerful devil-human hybrid after merging with his pet devil."),
  tv("tt2106480", "Chainsaw Man", "2022", "8.5", ["Animation"], "/npdB6eFzizki0WaZ1OvBcGcCwQw.jpg", "A young man reborn as a devil-human hybrid."),
  tv("tt9335498", "Demon Slayer: Kimetsu no Yaiba", "2019", "8.7", ["Animation", "Action", "Adventure"], "/wrCVHdkBlBWdJUZPvnJWcBRyhcz.jpg", "A family is attacked by demons and only two members survive — Tanjiro and his sister Nezuko."),
  tv("tt0903747", "Breaking Bad", "2008", "9.5", ["Crime", "Drama"], "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", "A chemistry teacher turns to crime."),
  tv("tt5491994", "Planet Earth II", "2016", "9.4", ["Documentary"], "/wB3fF3zZ8t7t6WnaC6YpJj9e9lC.jpg", "David Attenborough wildlife documentary."),
]

export const CATALOG: Title[] = cleanCatalog(_RAW_CATALOG)

// Build curated rows for the home page.
export type ContentRow = {
  title: string
  titles: Title[]
}

export function getRows(): ContentRow[] {
  // Deduplicate by imdbId (some entries are intentionally repeated above for
  // genre mix; we dedupe per row).
  const unique = (arr: Title[]) => {
    const seen = new Set<string>()
    return arr.filter((t) => {
      if (seen.has(t.imdbId)) return false
      seen.add(t.imdbId)
      return true
    })
  }

  const movies = unique(CATALOG.filter((t) => t.type === "movie"))
  const series = unique(CATALOG.filter((t) => t.type === "series"))
  const all = unique(CATALOG)
  const featured = unique(CATALOG.filter((t) => t.badge === "Featured"))
  const trending = unique(CATALOG.slice(0, 18))
  const topRated = [...all].sort((a, b) => Number(b.rating) - Number(a.rating)).slice(0, 14)
  const action = unique(all.filter((t) => t.genre.includes("Action"))).slice(0, 16)
  const drama = unique(all.filter((t) => t.genre.includes("Drama"))).slice(0, 16)
  const scifi = unique(all.filter((t) => t.genre.includes("Sci-Fi"))).slice(0, 16)
  const crime = unique(all.filter((t) => t.genre.includes("Crime"))).slice(0, 16)
  const comedy = unique(all.filter((t) => t.genre.includes("Comedy"))).slice(0, 16)
  const thriller = unique(all.filter((t) => t.genre.includes("Thriller"))).slice(0, 16)
  const adventure = unique(all.filter((t) => t.genre.includes("Adventure"))).slice(0, 16)
  const animation = unique(all.filter((t) => t.genre.includes("Animation"))).slice(0, 16)
  const horror = unique(all.filter((t) => t.genre.includes("Horror"))).slice(0, 16)
  const recent2020s = unique(all.filter((t) => Number(t.year) >= 2020)).slice(0, 16)
  const classics = unique(all.filter((t) => Number(t.year) < 2000)).slice(0, 16)

  return [
    { title: "Trending Now", titles: trending },
    { title: "Top 10 Rated Today", titles: topRated.slice(0, 10) },
    { title: "New on NetStream", titles: recent2020s },
    { title: "Popular Movies", titles: movies },
    { title: "Popular Series", titles: series },
    { title: "Action & Adventure", titles: action },
    { title: "Critically Acclaimed Dramas", titles: drama },
    { title: "Sci-Fi & Beyond", titles: scifi },
    { title: "Crime & Mystery", titles: crime },
    { title: "Laugh-Out-Loud Comedies", titles: comedy },
    { title: "Edge-of-Your-Seat Thrillers", titles: thriller },
    { title: "Epic Adventures", titles: adventure },
    { title: "Animated Gems", titles: animation },
    { title: "Spine-Chilling Horror", titles: horror },
    { title: "Timeless Classics", titles: classics },
  ]
}

export function getHeroTitles(): Title[] {
  const featured = CATALOG.filter((t) => t.badge === "Featured")
  return featured.length > 0 ? featured : CATALOG.slice(0, 4)
}

export function findTitle(imdbId: string): Title | undefined {
  return CATALOG.find((t) => t.imdbId === imdbId)
}

// SimplyStremio -> AIOStreams configuration translator.
// This file deliberately contains only the translation layer.
// The AIOStreams instance and user creation happen server-side.

const AIO_RESOLUTIONS = ["2160p","1440p","1080p","720p","576p","480p","360p","240p","144p","Unknown"];
const AIO_QUALITIES = ["BluRay REMUX","BluRay","WEB-DL","WEBRip","HDRip","HC HD-Rip","DVD REMUX","DVDRip","HDTV","CAM","TS","TC","SCR","Unknown"];
const AIO_VISUAL_TAGS = ["HDR+DV","DV Only","HDR Only","HDR10+","HDR10","DV","HDR","HLG","10bit","3D","IMAX","AI","Upscaled","SDR","H-OU","H-SBS","Unknown"];
const AIO_LANGUAGES = new Set([
  "English","Japanese","Chinese","Russian","Arabic","Portuguese","Portuguese (Brazil)",
  "Spanish","French","German","Italian","Korean","Hindi","Bengali","Punjabi","Marathi",
  "Gujarati","Tamil","Telugu","Kannada","Malayalam","Thai","Vietnamese","Indonesian",
  "Turkish","Hebrew","Persian","Ukrainian","Greek","Lithuanian","Latvian","Estonian",
  "Polish","Czech","Original"
]);

const SERVICE_CREDENTIALS = {
  torbox: { id: "torbox", fields: ["apiKey"] },
  "real-debrid": { id: "realdebrid", fields: ["apiKey"] },
  premiumize: { id: "premiumize", fields: ["apiKey"] },
  alldebrid: { id: "alldebrid", fields: ["apiKey"] },
  "debrid-link": { id: "debridlink", fields: ["apiKey"] },
  offcloud: { id: "offcloud", fields: ["apiKey", "email", "password"] },
  easydebrid: { id: "easydebrid", fields: ["apiKey"] },
  putio: { id: "putio", fields: ["clientId", "token"] },
  seedr: { id: "seedr", fields: ["encodedToken"] },
  pikpak: { id: "pikpak", fields: ["email", "password"] },
  debrider: { id: "debrider", fields: ["apiKey"] }
};

function read(key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readText(key, fallback = "") {
  try {
    return sessionStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function clean(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
}

function serviceConfig() {
  const provider = readText("simplyStremioProvider");
  const definition = SERVICE_CREDENTIALS[provider];

  if (!definition) throw new Error("Unsupported provider: " + provider);

  let credentials = read("simplyStremioProviderCredentials", null);
  if (!credentials || typeof credentials !== "object") {
    const legacy = readText("simplyStremioApiKey");
    credentials = legacy ? { apiKey: legacy } : {};
  }

  for (const field of definition.fields) {
    if (!credentials[field]) {
      throw new Error("Missing " + field + " for " + provider);
    }
  }

  return [{
    id: definition.id,
    enabled: true,
    credentials
  }];
}

function qualityProfile() {
  const data = read("simplyStremioAdvancedVideoQuality", {}) || {};
  let resolutions = [...AIO_RESOLUTIONS];
  let qualities = [...AIO_QUALITIES];

  if (data.resolution === "4k-preferred") {
    resolutions = ["2160p","1440p","1080p",...AIO_RESOLUTIONS.filter(x => !["2160p","1440p","1080p"].includes(x))];
  } else if (data.resolution === "1080p") {
    resolutions = ["1080p","2160p","1440p","720p",...AIO_RESOLUTIONS.filter(x => !["1080p","2160p","1440p","720p"].includes(x))];
  }

  if (data.qualityWeight === "release-quality") {
    qualities = ["BluRay REMUX","BluRay","WEB-DL","WEBRip",...AIO_QUALITIES.filter(x => !["BluRay REMUX","BluRay","WEB-DL","WEBRip"].includes(x))];
  }

  return { resolutions, qualities };
}

function languageProfile() {
  const advanced = read("simplyStremioAdvancedLanguages", {}) || {};
  const simpleInternational = readText("simplyStremioInternational", "mixture");

  const advancedLanguages = clean(advanced.languages)
    .filter(value => value !== "Other")
    .filter(value => AIO_LANGUAGES.has(value));

  let preferred = advancedLanguages;

  if (!preferred.length) {
    if (simpleInternational === "mostly-english") preferred = ["English", "Original"];
    else preferred = ["Original", "English"];
  }

  const subtitles = advanced.subtitles;
  const preferredSubtitles =
    subtitles === "English" ? ["English"] :
    subtitles === "spoken" ? ["Original", ...preferred] :
    [];

  return {
    preferredLanguages: clean(preferred),
    preferredSubtitles: clean(preferredSubtitles)
  };
}

function pictureProfile() {
  const data = read("simplyStremioAdvancedPicture", {}) || {};
  if (data.pictureStyle === "neutral" || data.pictureWeight === "none") return [];

  // AIOStreams ranks the preferred list when visualTag is part of sorting.
  // We deliberately prefer broadly useful HDR/DV tags and do not require them.
  return ["HDR+DV","DV","HDR10+","HDR10","HDR","HLG","10bit","IMAX"]
    .filter(tag => AIO_VISUAL_TAGS.includes(tag));
}

function sortCriteria({ language, picture, availability, qualityWeight, pictureWeight, resultPriority, releasePreference }) {
  const cached = {key:"cached",direction:"desc"};
  const resolution = {key:"resolution",direction:"desc"};
  const quality = {key:"quality",direction:"desc"};
  const visual = {key:"visualTag",direction:"desc"};
  const languageSort = {key:"language",direction:"desc"};
  const subtitle = {key:"subtitle",direction:"desc"};
  const sizeAsc = {key:"size",direction:"asc"};
  const sizeDesc = {key:"size",direction:"desc"};
  const addon = {key:"addon",direction:"desc"};

  const global = [];

  if (availability === "high") global.push(cached);

  if (releasePreference === "compact") {
    global.push(resolution, sizeAsc, quality);
  } else if (qualityWeight === "release-quality" || releasePreference === "quality") {
    global.push(quality, resolution);
  } else {
    global.push(resolution, quality);
  }

  if (picture.length) {
    if (pictureWeight === "high") global.push(visual);
    else if (pictureWeight === "medium") global.push(visual);
  }

  if (resultPriority === "match") {
    if (language.preferredLanguages.length) global.push(languageSort);
    if (language.preferredSubtitles.length) global.push(subtitle);
  } else if (resultPriority === "variety") {
    global.push(addon);
  }

  if (picture.length && pictureWeight === "low") global.push(visual);
  if (language.preferredLanguages.length && resultPriority !== "match") global.push(languageSort);
  if (language.preferredSubtitles.length && resultPriority !== "match") global.push(subtitle);

  if (releasePreference === "compact") {
    global.push(sizeAsc);
  } else if (releasePreference !== "quality") {
    global.push(sizeDesc);
  }

  if (availability === "medium") global.push(cached);
  if (availability === "low" || availability === "none") {
    if (availability === "low") global.push(cached);
  }

  if (!global.length) global.push(resolution, quality);
  return { global };
}
function resultLimits() {
  const results = read("simplyStremioAdvancedResults", {}) || {};
  const releases = read("simplyStremioAdvancedReleases", {}) || {};

  const amount =
    releases.releaseAmount === "few" ? 8 :
    releases.releaseAmount === "handful" ? 16 :
    releases.releaseAmount === "plenty" ? 30 :
    50;

  const variety =
    results.resultVariety === "focused" ? 8 :
    results.resultVariety === "balanced" ? 16 :
    results.resultVariety === "wide" ? 30 :
    50;

  return {
    global: Math.max(amount, variety),
    mode: "independent"
  };
}

function catalogModifications() {
  const priority = read("simplyStremioPriority", []) || [];
  const amount = readText("simplyStremioAmount", "selection");
  const adventure = readText("simplyStremioAdventure", "balanced");

  const movieSeries = [
    { id: "tmdb.top", name: "Popular", enabled: true },
    { id: "tmdb.trending", name: "Trending", enabled: amount !== "simple" },
    { id: "tmdb.year", name: "Year", enabled: amount !== "simple" },
    { id: "tmdb.language", name: "Language", enabled: amount === "everything" },
    { id: "tmdb.search", name: "Search", enabled: amount === "everything" }
  ];

  const preferMovies = priority.includes("movies") && !priority.includes("mixture");
  const preferSeries = priority.includes("series") && !priority.includes("mixture");

  return movieSeries.flatMap(catalog => [
    { id: "simply-tmdb." + catalog.id, type: "movie", name: catalog.name, enabled: catalog.enabled && !preferSeries, shuffle: adventure === "surprise" },
    { id: "simply-tmdb." + catalog.id, type: "series", name: catalog.name, enabled: catalog.enabled && !preferMovies, shuffle: adventure === "surprise" }
  ]);
}

function buildPresets(animeEnabled) {
  const presets = [
    {
      type: "torrentio",
      instanceId: "simply-torrentio",
      enabled: true,
      options: {
        name: "Torrentio",
        timeout: 15000,
        resources: ["stream","catalog","meta"],
        providers: [],
        useMultipleInstances: false,
        mediaTypes: []
      }
    },
    {
      type: "comet",
      instanceId: "simply-comet",
      enabled: true,
      options: {
        name: "Comet",
        timeout: 15000,
        resources: ["stream"],
        includeP2P: false,
        removeTrash: true,
        scrapeDebridAccountTorrents: false,
        useMultipleInstances: false,
        mediaTypes: []
      }
    },
    {
      type: "tmdb-addon",
      instanceId: "simply-tmdb",
      enabled: true,
      options: {
        name: "The Movie Database",
        timeout: 7000,
        resources: ["catalog","meta"],
        includeAdult: false,
        provideImdbId: false,
        hideEpisodeThumbnails: false,
        language: "en-US"
      }
    }
  ];

  if (animeEnabled) {
    presets.push({
      type: "anime-catalogs",
      instanceId: "simply-anime",
      enabled: true,
      options: {
        name: "Anime Catalogs",
        timeout: 7000,
        resources: ["catalog"],
        dubbed: false,
        cinemeta: true,
        search: true,
        mal_catalogs: ["myanimelist_popular","myanimelist_top-airing"],
        anidb_catalogs: [],
        anilist_catalogs: ["anilist_trending-now","anilist_popular-this-season"],
        kitsu_catalogs: ["kitsu_most-popular","kitsu_top-airing"],
        anisearch_catalogs: [],
        livechart_catalogs: [],
        notifymoe_catalogs: []
      }
    });
  }

  return presets;
}

export function buildAioStreamsConfig() {
  const animeEnabled = readText("simplyStremioAnime", "false") === "true";
  const quality = qualityProfile();
  const language = languageProfile();
  const picture = pictureProfile();
  const results = read("simplyStremioAdvancedResults", {}) || {};
  const releases = read("simplyStremioAdvancedReleases", {}) || {};
  const qualitySettings = read("simplyStremioAdvancedVideoQuality", {}) || {};
  const pictureSettings = read("simplyStremioAdvancedPicture", {}) || {};
  const availability = results.availability || "low";
  const qualityWeight = qualitySettings.qualityWeight || "balanced";
  const resultPriority = results.resultPriority || "balance";
  const pictureWeight = pictureSettings.pictureWeight || "medium";
  const releasePreference = releases.releasePreference || "quality";

  return {
    formatter: { id: "gdrive" },
    services: serviceConfig(),
    presets: buildPresets(animeEnabled),
    preferredResolutions: quality.resolutions,
    preferredQualities: quality.qualities,
    excludedQualities: ["CAM","SCR","TS","TC"],
    excludedVisualTags: ["3D"],
    preferredLanguages: language.preferredLanguages,
    preferredSubtitles: language.preferredSubtitles,
    preferredVisualTags: picture,
    sortCriteria: sortCriteria({ language, picture, availability, qualityWeight, pictureWeight, resultPriority, releasePreference }),
    resultLimits: resultLimits(),
    deduplicator: {
      enabled: true,
      keys: ["filename","infoHash"],
      multiGroupBehaviour: "aggressive",
      cached: "single_result",
      uncached: "per_service",
      p2p: "single_result"
    },
    autoPlay: {
      enabled: true,
      method: "matchingFile",
      attributes: ["resolution","quality","releaseGroup"]
    },
    cacheAndPlay: { enabled: false, streamTypes: ["usenet"] },
    statistics: { enabled: false },
    languageInference: { enabled: true, sources: [] },
    catalogModifications: catalogModifications(),
    checkOwned: true,
    // These Simple answers are intentionally not converted into fake filters:
    // genres, discovery traits and era need a custom catalog-generation layer.
  };
}

export function getUnsupportedSimpleAnswers() {
  return {
    genres: read("simplyStremioGenres", []),
    discovery: read("simplyStremioDiscovery", []),
    era: readText("simplyStremioEra", "balanced")
  };
}

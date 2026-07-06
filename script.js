const CANONICAL_HOST = "movie-notes-app-ecru.vercel.app";
const SUPABASE_URL = "https://zjolzipsoqsczilhgqwq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KYwwO9ZHOAg4T45dzCAXsg_fJbShoXd";
const STORAGE_BUCKET = "movie-posters";
const MAX_POSTER_FILE_SIZE = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
const SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MOVIES_PER_PAGE = 20;

const isVercelPreviewHost =
  location.hostname.endsWith(".vercel.app") && location.hostname !== CANONICAL_HOST;

if (isVercelPreviewHost) {
  const targetUrl = new URL(location.href);
  targetUrl.protocol = "https:";
  targetUrl.hostname = CANONICAL_HOST;
  location.replace(targetUrl.toString());
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    db: { schema: "public" },
  },
);

const elements = {
  accountChip: document.querySelector("#accountChip"),
  addMovieButton: document.querySelector("#addMovieButton"),
  appContent: document.querySelector("#appContent"),
  appStatus: document.querySelector("#appStatus"),
  authError: document.querySelector("#authError"),
  authForm: document.querySelector("#authForm"),
  authView: document.querySelector("#authView"),
  cancelButton: document.querySelector("#cancelButton"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  closeDetailButton: document.querySelector("#closeDetailButton"),
  closeModalButton: document.querySelector("#closeModalButton"),
  detailDeleteButton: document.querySelector("#detailDeleteButton"),
  detailEditButton: document.querySelector("#detailEditButton"),
  detailModal: document.querySelector("#detailModal"),
  detailPoster: document.querySelector("#detailPoster"),
  detailReleaseYear: document.querySelector("#detailReleaseYear"),
  detailReview: document.querySelector("#detailReview"),
  detailTitle: document.querySelector("#detailTitle"),
  detailWatchedDate: document.querySelector("#detailWatchedDate"),
  emailInput: document.querySelector("#emailInput"),
  emptyAddButton: document.querySelector("#emptyAddButton"),
  emptyState: document.querySelector("#emptyState"),
  form: document.querySelector("#movieForm"),
  formError: document.querySelector("#formError"),
  modal: document.querySelector("#movieModal"),
  modalTitle: document.querySelector("#modalTitle"),
  movieGrid: document.querySelector("#movieGrid"),
  movieId: document.querySelector("#movieId"),
  nextPageButton: document.querySelector("#nextPageButton"),
  pageButtons: document.querySelector("#pageButtons"),
  passwordInput: document.querySelector("#passwordInput"),
  pagination: document.querySelector("#pagination"),
  posterCurrentValue: document.querySelector("#posterCurrentValue"),
  posterFileInput: document.querySelector("#posterFileInput"),
  posterHelp: document.querySelector("#posterHelp"),
  prevPageButton: document.querySelector("#prevPageButton"),
  posterInput: document.querySelector("#posterInput"),
  releaseYearInput: document.querySelector("#releaseYearInput"),
  removePosterField: document.querySelector("#removePosterField"),
  removePosterInput: document.querySelector("#removePosterInput"),
  resultSummary: document.querySelector("#resultSummary"),
  reviewInput: document.querySelector("#reviewInput"),
  searchInput: document.querySelector("#searchInput"),
  signInButton: document.querySelector("#signInButton"),
  signOutButton: document.querySelector("#signOutButton"),
  sortSelect: document.querySelector("#sortSelect"),
  titleInput: document.querySelector("#titleInput"),
  watchedDateInput: document.querySelector("#watchedDateInput"),
};

let movies = [];
let session = null;
let isSaving = false;
let selectedDetailMovieId = "";
let currentPage = 1;
let lastPosterRefreshAt = 0;

const posterUrlCache = new Map();

function normalizeText(value) {
  return value.trim().replace(/\s+/g, " ");
}

function getVisibleMovies() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase("ko-KR");
  const [field, direction] = elements.sortSelect.value.split("-");
  const multiplier = direction === "asc" ? 1 : -1;

  return movies
    .filter((movie) => movie.title.toLocaleLowerCase("ko-KR").includes(query))
    .sort((a, b) => {
      if (field === "releaseYear") {
        return (a.releaseYear - b.releaseYear) * multiplier;
      }

      return a.watchedDate.localeCompare(b.watchedDate) * multiplier;
    });
}

function getPageCount(totalItems) {
  return Math.max(1, Math.ceil(totalItems / MOVIES_PER_PAGE));
}

function clampCurrentPage(totalItems) {
  currentPage = Math.min(Math.max(currentPage, 1), getPageCount(totalItems));
}

function getPageItems(items) {
  const startIndex = (currentPage - 1) * MOVIES_PER_PAGE;
  return items.slice(startIndex, startIndex + MOVIES_PER_PAGE);
}

function getPaginationRange(pageCount) {
  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(pageCount, currentPage + 2);

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  return pages;
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mapMovieFromDb(row) {
  return {
    id: row.id,
    title: row.title,
    releaseYear: row.release_year,
    watchedDate: row.watched_date,
    review: row.review || "",
    poster: row.poster || "",
    posterUrl: "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isExternalPoster(value) {
  return /^https?:\/\//i.test(value || "");
}

function isStoragePoster(value) {
  return Boolean(value) && !isExternalPoster(value);
}

function getCachedPosterUrl(poster) {
  const cached = posterUrlCache.get(poster);

  if (!cached) {
    return "";
  }

  if (cached.expiresAt <= Date.now() + SIGNED_URL_REFRESH_BUFFER_MS) {
    posterUrlCache.delete(poster);
    return "";
  }

  return cached.url;
}

async function resolvePosterUrl(poster, options = {}) {
  if (!poster) {
    return "";
  }

  if (isExternalPoster(poster)) {
    return poster;
  }

  if (!options.forceRefresh) {
    const cachedUrl = getCachedPosterUrl(poster);
    if (cachedUrl) {
      return cachedUrl;
    }
  }

  const { data, error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(poster, SIGNED_URL_TTL_SECONDS);

  if (error) {
    return "";
  }

  posterUrlCache.set(poster, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  });

  return data.signedUrl;
}

async function hydratePosterUrls(items, options = {}) {
  return Promise.all(
    items.map(async (movie) => ({
      ...movie,
      posterUrl: await resolvePosterUrl(movie.poster, options),
    })),
  );
}

function movieToDbPayload(posterValue) {
  return {
    title: normalizeText(elements.titleInput.value),
    release_year: Number(elements.releaseYearInput.value),
    watched_date: elements.watchedDateInput.value,
    review: elements.reviewInput.value.trim(),
    poster: posterValue || null,
  };
}

function setStatus(message = "") {
  elements.appStatus.textContent = message;
}

function setAuthError(message = "") {
  elements.authError.textContent = message;
}

function setFormError(message = "") {
  elements.formError.textContent = message;
}

function setSavingState(nextIsSaving) {
  isSaving = nextIsSaving;
  elements.form.querySelector('button[type="submit"]').disabled = isSaving;
}

function renderAuthState() {
  const isSignedIn = Boolean(session?.user);

  elements.authView.classList.toggle("is-hidden", isSignedIn);
  elements.appContent.classList.toggle("is-hidden", !isSignedIn);
  elements.addMovieButton.classList.toggle("is-hidden", !isSignedIn);
  elements.accountChip.classList.toggle("is-hidden", !isSignedIn);
  if (!isSignedIn) {
    movies = [];
    renderMovies();
    closeModal();
    closeDetail();
    setStatus("");
  }
}

function renderMovies() {
  const visibleMovies = getVisibleMovies();
  const hasSearch = elements.searchInput.value.trim().length > 0;
  clampCurrentPage(visibleMovies.length);

  const pageCount = getPageCount(visibleMovies.length);
  const pageMovies = getPageItems(visibleMovies);
  elements.resultSummary.textContent = hasSearch
    ? `${visibleMovies.length}편 검색됨`
    : `${movies.length}편의 기록`;
  elements.clearSearchButton.disabled = !hasSearch;

  elements.movieGrid.innerHTML = pageMovies.map(renderMovieCard).join("");
  elements.emptyState.classList.toggle("is-hidden", visibleMovies.length > 0);
  elements.movieGrid.classList.toggle("is-hidden", visibleMovies.length === 0);
  renderPagination(pageCount, visibleMovies.length);

  if (visibleMovies.length === 0 && hasSearch) {
    elements.emptyState.querySelector("h2").textContent = "검색 결과가 없습니다";
    elements.emptyState.querySelector("p").textContent =
      "다른 제목으로 다시 검색해보세요.";
  } else {
    elements.emptyState.querySelector("h2").textContent = "아직 기록이 없습니다";
    elements.emptyState.querySelector("p").textContent =
      "처음 남기고 싶은 영화 한 편을 추가해보세요.";
  }
}

function renderPagination(pageCount, totalItems) {
  const shouldShow = totalItems > MOVIES_PER_PAGE;
  elements.pagination.classList.toggle("is-hidden", !shouldShow);

  if (!shouldShow) {
    elements.pageButtons.innerHTML = "";
    return;
  }

  const pages = getPaginationRange(pageCount);
  const leadingButton =
    pages[0] > 1
      ? `<button class="page-button" type="button" data-page="1">1</button>`
      : "";
  const leadingGap = pages[0] > 2 ? `<span class="page-gap">...</span>` : "";
  const trailingGap =
    pages[pages.length - 1] < pageCount - 1 ? `<span class="page-gap">...</span>` : "";
  const trailingButton =
    pages[pages.length - 1] < pageCount
      ? `<button class="page-button" type="button" data-page="${pageCount}">${pageCount}</button>`
      : "";
  const pageButtons = pages
    .map(
      (page) => `
        <button
          class="page-button${page === currentPage ? " is-active" : ""}"
          type="button"
          data-page="${page}"
          ${page === currentPage ? 'aria-current="page"' : ""}
        >
          ${page}
        </button>
      `,
    )
    .join("");

  elements.pageButtons.innerHTML = `${leadingButton}${leadingGap}${pageButtons}${trailingGap}${trailingButton}`;
  elements.prevPageButton.disabled = currentPage === 1;
  elements.nextPageButton.disabled = currentPage === pageCount;
}

function changePage(nextPage) {
  const pageCount = getPageCount(getVisibleMovies().length);
  currentPage = Math.min(Math.max(nextPage, 1), pageCount);
  renderMovies();
  elements.resultSummary.scrollIntoView({ block: "start", behavior: "smooth" });
}

function resetPageAndRender() {
  currentPage = 1;
  renderMovies();
}

function renderPosterMarkup(movie, className = "poster-frame") {
  const safeTitle = escapeHtml(movie.title);
  const safePoster = movie.posterUrl ? escapeHtml(movie.posterUrl) : "";
  const safePosterPath = movie.poster ? escapeHtml(movie.poster) : "";

  if (!safePoster) {
    return `<div class="${className}"><div class="poster-placeholder" aria-hidden="true"><span></span></div></div>`;
  }

  return `
    <div class="${className}">
      <img src="${safePoster}" alt="${safeTitle} 포스터" loading="lazy" data-poster-path="${safePosterPath}" />
      <div class="poster-placeholder is-hidden" aria-hidden="true"><span></span></div>
    </div>
  `;
}

function renderMovieCard(movie) {
  const safeTitle = escapeHtml(movie.title);
  const safeReview = movie.review
    ? escapeHtml(movie.review)
    : '<span class="muted-inline">감상이 비어 있습니다.</span>';

  return `
    <article class="movie-card" data-id="${escapeHtml(movie.id)}" tabindex="0" role="button" aria-label="${safeTitle} 자세히 보기">
      ${renderPosterMarkup(movie, "poster-frame")}
      <div class="card-body">
        <div class="card-main">
          <h2 class="card-title">${safeTitle}</h2>
          <div class="card-meta">
            <span class="meta-pill">${movie.releaseYear}</span>
            <span>${formatDate(movie.watchedDate)}</span>
          </div>
          <p class="review-preview">${safeReview}</p>
        </div>
      </div>
    </article>
  `;
}

async function loadMoviesFromDb() {
  if (!session?.user) {
    return;
  }

  setStatus("불러오는 중");

  const { data, error } = await supabaseClient
    .from("movie_notes")
    .select("id,title,release_year,watched_date,review,poster,created_at,updated_at")
    .order("watched_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    setStatus("목록을 불러오지 못했습니다");
    return;
  }

  movies = await hydratePosterUrls(data.map(mapMovieFromDb));
  renderMovies();
  setStatus("");
}

function updatePosterHelp(movie = null) {
  const hasPoster = Boolean(movie?.poster);
  const currentIsStorageFile = isStoragePoster(movie?.poster);

  elements.removePosterField.classList.toggle("is-hidden", !hasPoster);
  elements.removePosterInput.checked = false;

  if (!hasPoster) {
    elements.posterHelp.textContent =
      "파일을 첨부하거나 URL을 입력할 수 있습니다. 파일은 비공개 저장소에 보관됩니다.";
    return;
  }

  elements.posterHelp.textContent = currentIsStorageFile
    ? "현재 첨부된 포스터가 있습니다. 새 파일을 고르면 교체되고, URL을 입력하면 URL 포스터로 바뀝니다."
    : "현재 URL 포스터를 사용 중입니다. 새 파일을 고르면 첨부 포스터로 바뀝니다.";
}

function openModal(movie = null) {
  elements.form.reset();
  setFormError("");

  if (movie) {
    elements.modalTitle.textContent = "영화 기록 수정";
    elements.movieId.value = movie.id;
    elements.titleInput.value = movie.title;
    elements.releaseYearInput.value = movie.releaseYear;
    elements.watchedDateInput.value = movie.watchedDate;
    elements.posterCurrentValue.value = movie.poster || "";
    elements.posterInput.value = isExternalPoster(movie.poster) ? movie.poster : "";
    elements.reviewInput.value = movie.review;
    updatePosterHelp(movie);
  } else {
    elements.modalTitle.textContent = "새 영화 기록";
    elements.movieId.value = "";
    elements.posterCurrentValue.value = "";
    elements.watchedDateInput.value = new Date().toISOString().slice(0, 10);
    updatePosterHelp();
  }

  elements.modal.classList.remove("is-hidden");
  elements.titleInput.focus();
}

function closeModal() {
  elements.modal.classList.add("is-hidden");
  setSavingState(false);
}

function openDetail(movie) {
  selectedDetailMovieId = movie.id;
  elements.detailTitle.textContent = movie.title;
  elements.detailReleaseYear.textContent = movie.releaseYear;
  elements.detailWatchedDate.textContent = formatDate(movie.watchedDate);
  elements.detailReview.textContent = movie.review || "감상이 비어 있습니다.";
  elements.detailPoster.innerHTML = renderPosterMarkup(movie, "poster-frame detail-poster-frame");
  elements.detailModal.classList.remove("is-hidden");
}

function closeDetail() {
  selectedDetailMovieId = "";
  elements.detailModal.classList.add("is-hidden");
}

async function refreshMoviePoster(movieId, options = {}) {
  const movie = movies.find((item) => item.id === movieId);

  if (!movie || !isStoragePoster(movie.poster)) {
    return null;
  }

  const posterUrl = await resolvePosterUrl(movie.poster, options);
  const updatedMovie = { ...movie, posterUrl };
  movies = movies.map((item) => (item.id === movieId ? updatedMovie : item));
  return updatedMovie;
}

async function refreshVisiblePosterUrls(options = {}) {
  if (!session?.user || movies.length === 0) {
    return;
  }

  if (!options.forceRefresh && Date.now() - lastPosterRefreshAt < 30 * 1000) {
    return;
  }

  lastPosterRefreshAt = Date.now();

  const refreshedMovies = await hydratePosterUrls(movies, options);
  movies = refreshedMovies;
  renderMovies();

  if (selectedDetailMovieId && !elements.detailModal.classList.contains("is-hidden")) {
    const detailMovie = movies.find((movie) => movie.id === selectedDetailMovieId);
    if (detailMovie) {
      openDetail(detailMovie);
    }
  }
}

async function handlePosterImageError(event) {
  const image = event.target.closest("img[data-poster-path]");
  if (!image) {
    return;
  }

  const posterPath = image.dataset.posterPath;
  const card = image.closest(".movie-card");
  const movieId = card?.dataset.id || selectedDetailMovieId;

  image.classList.add("is-hidden");
  image.nextElementSibling?.classList.remove("is-hidden");

  if (!posterPath || image.dataset.retryingPoster === "true") {
    return;
  }

  image.dataset.retryingPoster = "true";
  posterUrlCache.delete(posterPath);

  const updatedMovie = await refreshMoviePoster(movieId, { forceRefresh: true });
  if (!updatedMovie?.posterUrl) {
    return;
  }

  if (card) {
    image.src = updatedMovie.posterUrl;
    image.classList.remove("is-hidden");
    image.nextElementSibling?.classList.add("is-hidden");
  } else {
    openDetail(updatedMovie);
  }
}

function validateForm() {
  const title = normalizeText(elements.titleInput.value);
  const releaseYear = Number(elements.releaseYearInput.value);
  const watchedDate = elements.watchedDateInput.value;
  const posterFile = elements.posterFileInput.files[0];
  const posterUrl = elements.posterInput.value.trim();

  if (!title || !releaseYear || !watchedDate) {
    return "제목, 출시년도, 본 날짜를 입력해주세요.";
  }

  if (releaseYear < 1888 || releaseYear > 2100) {
    return "출시년도는 1888년부터 2100년 사이로 입력해주세요.";
  }

  if (posterUrl && !isExternalPoster(posterUrl)) {
    return "포스터 URL은 http:// 또는 https://로 시작해야 합니다.";
  }

  if (posterFile) {
    if (!posterFile.type.startsWith("image/")) {
      return "포스터는 이미지 파일만 첨부할 수 있습니다.";
    }

    if (posterFile.size > MAX_POSTER_FILE_SIZE) {
      return "포스터 파일은 5MB 이하로 첨부해주세요.";
    }
  }

  return "";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  setAuthError("");
  elements.signInButton.disabled = true;

  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  elements.signInButton.disabled = false;

  if (error) {
    setAuthError("이메일 또는 비밀번호를 확인해주세요.");
  }
}

async function handleSignOut() {
  setStatus("로그아웃 중");
  await supabaseClient.auth.signOut();
}

function getPosterExtension(file) {
  const filenameExtension = file.name.split(".").pop()?.toLowerCase();
  const allowed = ["jpg", "jpeg", "png", "webp", "gif"];

  if (filenameExtension && allowed.includes(filenameExtension)) {
    return filenameExtension;
  }

  return file.type.split("/")[1] || "jpg";
}

async function uploadPosterFile(file) {
  const extension = getPosterExtension(file);
  const randomName =
    crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${session.user.id}/${randomName}.${extension}`;

  const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  posterUrlCache.delete(path);
  return path;
}

async function resolvePosterValueBeforeSave() {
  const posterFile = elements.posterFileInput.files[0];
  const posterUrl = elements.posterInput.value.trim();
  const currentPoster = elements.posterCurrentValue.value.trim();

  if (posterFile) {
    return uploadPosterFile(posterFile);
  }

  if (posterUrl) {
    return posterUrl;
  }

  if (elements.removePosterInput.checked) {
    return "";
  }

  if (isStoragePoster(currentPoster)) {
    return currentPoster;
  }

  return "";
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!session?.user || isSaving) {
    return;
  }

  const errorMessage = validateForm();
  if (errorMessage) {
    setFormError(errorMessage);
    return;
  }

  setSavingState(true);
  setFormError("");

  let posterValue = "";

  try {
    posterValue = await resolvePosterValueBeforeSave();
  } catch (_error) {
    setSavingState(false);
    setFormError("포스터를 업로드하지 못했습니다. 파일을 확인해주세요.");
    return;
  }

  const id = elements.movieId.value;
  const previousMovie = id ? movies.find((movie) => movie.id === id) : null;
  const payload = movieToDbPayload(posterValue);
  const query = id
    ? supabaseClient
        .from("movie_notes")
        .update(payload)
        .eq("id", id)
        .select("id,title,release_year,watched_date,review,poster,created_at,updated_at")
        .single()
    : supabaseClient
        .from("movie_notes")
        .insert(payload)
        .select("id,title,release_year,watched_date,review,poster,created_at,updated_at")
        .single();

  const { data, error } = await query;
  setSavingState(false);

  if (error) {
    if (isStoragePoster(posterValue) && posterValue !== previousMovie?.poster) {
      await supabaseClient.storage.from(STORAGE_BUCKET).remove([posterValue]);
      posterUrlCache.delete(posterValue);
    }

    setFormError("저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  const [nextMovie] = await hydratePosterUrls([mapMovieFromDb(data)]);

  if (
    previousMovie &&
    isStoragePoster(previousMovie.poster) &&
    previousMovie.poster !== nextMovie.poster
  ) {
    await supabaseClient.storage.from(STORAGE_BUCKET).remove([previousMovie.poster]);
    posterUrlCache.delete(previousMovie.poster);
  }

  if (id) {
    movies = movies.map((movie) => (movie.id === id ? nextMovie : movie));
  } else {
    movies = [nextMovie, ...movies];
    currentPage = 1;
  }

  renderMovies();
  closeModal();

  if (selectedDetailMovieId === nextMovie.id) {
    openDetail(nextMovie);
  }
}

async function deleteMovie(movie) {
  const { error } = await supabaseClient.from("movie_notes").delete().eq("id", movie.id);

  if (error) {
    setStatus("삭제하지 못했습니다");
    return false;
  }

  if (isStoragePoster(movie.poster)) {
    await supabaseClient.storage.from(STORAGE_BUCKET).remove([movie.poster]);
    posterUrlCache.delete(movie.poster);
  }

  movies = movies.filter((item) => item.id !== movie.id);
  renderMovies();
  setStatus("");
  return true;
}

async function handleGridClick(event) {
  const card = event.target.closest(".movie-card");

  if (!card || !session?.user) {
    return;
  }

  const movie = movies.find((item) => item.id === card.dataset.id);
  if (!movie) {
    return;
  }

  openDetail(movie);
}

function handleGridKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest(".movie-card");
  if (!card) {
    return;
  }

  event.preventDefault();

  const movie = movies.find((item) => item.id === card.dataset.id);
  if (movie) {
    openDetail(movie);
  }
}

function handleBackdropClick(event) {
  if (event.target === elements.modal) {
    closeModal();
  }

  if (event.target === elements.detailModal) {
    closeDetail();
  }
}

function handleKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (!elements.modal.classList.contains("is-hidden")) {
    closeModal();
  }

  if (!elements.detailModal.classList.contains("is-hidden")) {
    closeDetail();
  }
}

function getSelectedDetailMovie() {
  return movies.find((movie) => movie.id === selectedDetailMovieId);
}

async function handleDetailDelete() {
  const movie = getSelectedDetailMovie();
  if (!movie) {
    return;
  }

  const confirmed = confirm(`"${movie.title}" 기록을 삭제할까요?`);
  if (!confirmed) {
    return;
  }

  const deleted = await deleteMovie(movie);
  if (deleted) {
    closeDetail();
  }
}

function handleDetailEdit() {
  const movie = getSelectedDetailMovie();
  if (!movie) {
    return;
  }

  closeDetail();
  openModal(movie);
}

function handleWindowFocus() {
  refreshVisiblePosterUrls();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    refreshVisiblePosterUrls();
  }
}

async function initializeApp() {
  renderMovies();
  setStatus("세션 확인 중");

  const {
    data: { session: currentSession },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    setAuthError("로그인 상태를 확인하지 못했습니다.");
    setStatus("");
    return;
  }

  session = currentSession;
  renderAuthState();

  if (session?.user) {
    await loadMoviesFromDb();
  }

  supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    renderAuthState();

    if (session?.user) {
      await loadMoviesFromDb();
    }
  });
}

elements.addMovieButton.addEventListener("click", () => openModal());
elements.authForm.addEventListener("submit", handleAuthSubmit);
elements.emptyAddButton.addEventListener("click", () => openModal());
elements.closeModalButton.addEventListener("click", closeModal);
elements.cancelButton.addEventListener("click", closeModal);
elements.form.addEventListener("submit", handleSubmit);
elements.movieGrid.addEventListener("click", handleGridClick);
elements.movieGrid.addEventListener("keydown", handleGridKeydown);
elements.movieGrid.addEventListener("error", handlePosterImageError, true);
elements.modal.addEventListener("click", handleBackdropClick);
elements.detailModal.addEventListener("click", handleBackdropClick);
elements.detailPoster.addEventListener("error", handlePosterImageError, true);
elements.closeDetailButton.addEventListener("click", closeDetail);
elements.detailDeleteButton.addEventListener("click", handleDetailDelete);
elements.detailEditButton.addEventListener("click", handleDetailEdit);
elements.nextPageButton.addEventListener("click", () => changePage(currentPage + 1));
elements.pageButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (!button) {
    return;
  }

  changePage(Number(button.dataset.page));
});
elements.prevPageButton.addEventListener("click", () => changePage(currentPage - 1));
elements.searchInput.addEventListener("input", resetPageAndRender);
elements.signOutButton.addEventListener("click", handleSignOut);
elements.sortSelect.addEventListener("change", resetPageAndRender);
elements.clearSearchButton.addEventListener("click", () => {
  elements.searchInput.value = "";
  elements.searchInput.focus();
  resetPageAndRender();
});
document.addEventListener("keydown", handleKeydown);
document.addEventListener("visibilitychange", handleVisibilityChange);
window.addEventListener("focus", handleWindowFocus);

initializeApp();

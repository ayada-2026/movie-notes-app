const CANONICAL_HOST = "movie-notes-app-ecru.vercel.app";
const STORAGE_KEY = "movie-notes.records.v1";
const IMPORT_HASH_KEY = "movieNotesImport";
const isVercelPreviewHost =
  location.hostname.endsWith(".vercel.app") && location.hostname !== CANONICAL_HOST;

if (isVercelPreviewHost) {
  const targetUrl = new URL(location.href);
  const storedMovies = localStorage.getItem(STORAGE_KEY);

  targetUrl.protocol = "https:";
  targetUrl.hostname = CANONICAL_HOST;

  if (storedMovies && storedMovies !== "[]") {
    targetUrl.hash = `${IMPORT_HASH_KEY}=${encodeURIComponent(storedMovies)}`;
  }

  location.replace(targetUrl.toString());
}

importMoviesFromHash();

const elements = {
  addMovieButton: document.querySelector("#addMovieButton"),
  emptyAddButton: document.querySelector("#emptyAddButton"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  closeModalButton: document.querySelector("#closeModalButton"),
  cancelButton: document.querySelector("#cancelButton"),
  modal: document.querySelector("#movieModal"),
  modalTitle: document.querySelector("#modalTitle"),
  form: document.querySelector("#movieForm"),
  formError: document.querySelector("#formError"),
  movieGrid: document.querySelector("#movieGrid"),
  emptyState: document.querySelector("#emptyState"),
  resultSummary: document.querySelector("#resultSummary"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  movieId: document.querySelector("#movieId"),
  titleInput: document.querySelector("#titleInput"),
  releaseYearInput: document.querySelector("#releaseYearInput"),
  watchedDateInput: document.querySelector("#watchedDateInput"),
  posterInput: document.querySelector("#posterInput"),
  reviewInput: document.querySelector("#reviewInput"),
};

let movies = loadMovies();

function loadMovies() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function importMoviesFromHash() {
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const importedMovies = hashParams.get(IMPORT_HASH_KEY);

  if (!importedMovies) {
    return;
  }

  try {
    const incomingMovies = JSON.parse(importedMovies);
    const savedMovies = loadMovies();

    if (!Array.isArray(incomingMovies)) {
      return;
    }

    const mergedMovies = new Map();

    [...savedMovies, ...incomingMovies].forEach((movie) => {
      if (!movie || !movie.id) {
        return;
      }

      const existingMovie = mergedMovies.get(movie.id);
      if (!existingMovie || movie.updatedAt > existingMovie.updatedAt) {
        mergedMovies.set(movie.id, movie);
      }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify([...mergedMovies.values()]));
  } catch {
    return;
  } finally {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
}

function saveMovies() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
}

function createMovieId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `movie_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

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

function formatDate(value) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMovies() {
  const visibleMovies = getVisibleMovies();
  const hasSearch = elements.searchInput.value.trim().length > 0;

  elements.resultSummary.textContent = hasSearch
    ? `${visibleMovies.length}개의 검색 결과`
    : `${movies.length}개의 기록`;
  elements.clearSearchButton.disabled = !hasSearch;

  elements.movieGrid.innerHTML = visibleMovies.map(renderMovieCard).join("");
  elements.emptyState.classList.toggle("is-hidden", visibleMovies.length > 0);
  elements.movieGrid.classList.toggle("is-hidden", visibleMovies.length === 0);

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

function renderMovieCard(movie) {
  const safeTitle = escapeHtml(movie.title);
  const safeReview = escapeHtml(movie.review);
  const safePoster = movie.poster ? escapeHtml(movie.poster) : "";
  const poster = safePoster
    ? `<img src="${safePoster}" alt="${safeTitle} 포스터" loading="lazy" onerror="this.classList.add('is-hidden'); this.nextElementSibling.classList.remove('is-hidden');" />
       <div class="poster-placeholder is-hidden" aria-hidden="true"><span></span></div>`
    : `<div class="poster-placeholder" aria-hidden="true"><span></span></div>`;

  return `
    <article class="movie-card" data-id="${escapeHtml(movie.id)}">
      <div class="poster-frame">
        ${poster}
      </div>
      <div class="card-body">
        <h2 class="card-title">${safeTitle}</h2>
        <div class="card-meta">
          <span class="meta-pill">${movie.releaseYear}</span>
          <span>${formatDate(movie.watchedDate)}</span>
        </div>
        <p class="review-preview">${safeReview}</p>
        <div class="card-actions">
          <button class="secondary-button" type="button" data-action="edit">수정</button>
          <button class="secondary-button danger-button" type="button" data-action="delete">삭제</button>
        </div>
      </div>
    </article>
  `;
}

function openModal(movie = null) {
  elements.form.reset();
  elements.formError.textContent = "";

  if (movie) {
    elements.modalTitle.textContent = "영화 기록 수정";
    elements.movieId.value = movie.id;
    elements.titleInput.value = movie.title;
    elements.releaseYearInput.value = movie.releaseYear;
    elements.watchedDateInput.value = movie.watchedDate;
    elements.posterInput.value = movie.poster || "";
    elements.reviewInput.value = movie.review;
  } else {
    elements.modalTitle.textContent = "새 영화 기록";
    elements.movieId.value = "";
    elements.watchedDateInput.value = new Date().toISOString().slice(0, 10);
  }

  elements.modal.classList.remove("is-hidden");
  elements.titleInput.focus();
}

function closeModal() {
  elements.modal.classList.add("is-hidden");
}

function validateForm() {
  const title = normalizeText(elements.titleInput.value);
  const releaseYear = Number(elements.releaseYearInput.value);
  const watchedDate = elements.watchedDateInput.value;
  const review = elements.reviewInput.value.trim();

  if (!title || !releaseYear || !watchedDate || !review) {
    return "제목, 출시년도, 본 날짜, 감상을 모두 입력해주세요.";
  }

  if (releaseYear < 1888 || releaseYear > 2100) {
    return "출시년도는 1888년부터 2100년 사이로 입력해주세요.";
  }

  return "";
}

function handleSubmit(event) {
  event.preventDefault();

  const errorMessage = validateForm();
  if (errorMessage) {
    elements.formError.textContent = errorMessage;
    return;
  }

  const now = new Date().toISOString();
  const id = elements.movieId.value || createMovieId();
  const existingMovie = movies.find((movie) => movie.id === id);
  const nextMovie = {
    id,
    title: normalizeText(elements.titleInput.value),
    releaseYear: Number(elements.releaseYearInput.value),
    watchedDate: elements.watchedDateInput.value,
    review: elements.reviewInput.value.trim(),
    poster: elements.posterInput.value.trim(),
    createdAt: existingMovie?.createdAt || now,
    updatedAt: now,
  };

  if (existingMovie) {
    movies = movies.map((movie) => (movie.id === id ? nextMovie : movie));
  } else {
    movies = [nextMovie, ...movies];
  }

  saveMovies();
  renderMovies();
  closeModal();
}

function handleGridClick(event) {
  const button = event.target.closest("button[data-action]");
  const card = event.target.closest(".movie-card");

  if (!button || !card) {
    return;
  }

  const movie = movies.find((item) => item.id === card.dataset.id);
  if (!movie) {
    return;
  }

  if (button.dataset.action === "edit") {
    openModal(movie);
    return;
  }

  const confirmed = confirm(`"${movie.title}" 기록을 삭제할까요?`);
  if (!confirmed) {
    return;
  }

  movies = movies.filter((item) => item.id !== movie.id);
  saveMovies();
  renderMovies();
}

function handleBackdropClick(event) {
  if (event.target === elements.modal) {
    closeModal();
  }
}

function handleKeydown(event) {
  if (event.key === "Escape" && !elements.modal.classList.contains("is-hidden")) {
    closeModal();
  }
}

elements.addMovieButton.addEventListener("click", () => openModal());
elements.emptyAddButton.addEventListener("click", () => openModal());
elements.closeModalButton.addEventListener("click", closeModal);
elements.cancelButton.addEventListener("click", closeModal);
elements.form.addEventListener("submit", handleSubmit);
elements.movieGrid.addEventListener("click", handleGridClick);
elements.modal.addEventListener("click", handleBackdropClick);
elements.searchInput.addEventListener("input", renderMovies);
elements.sortSelect.addEventListener("change", renderMovies);
elements.clearSearchButton.addEventListener("click", () => {
  elements.searchInput.value = "";
  elements.searchInput.focus();
  renderMovies();
});
document.addEventListener("keydown", handleKeydown);

renderMovies();

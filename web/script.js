// --- State Management ---
let globalChapters = [];
let selectedChapters = new Set();
let currentSeriesTitle = "Unknown Series";
let globalMainCover = "";
let allSelected = false;

// --- DOM Elements ---
const dom = {
  confirmBtn: document.getElementById("confirm-btn"),
  addLibBtn: document.getElementById("add-library-btn"),
  linkInput: document.getElementById("cubari-link"),
  infoBox: document.getElementById("info-box"),
  grid: document.getElementById("chapter-grid"),
  titleEl: document.getElementById("series-title"),
  dlCbzBtn: document.getElementById("dl-cbz-btn"),
  dlImagesBtn: document.getElementById("dl-images-btn"),
  selectAllBtn: document.getElementById("select-all-btn"),
  libraryList: document.getElementById("library-list"),
};

// --- Backend Bridge ---
eel.expose(update_status);
function update_status(msg) {
  dom.infoBox.innerText = msg;
}

// --- Init Library ---
window.addEventListener("DOMContentLoaded", loadLibrary);

async function loadLibrary() {
  const lib = await eel.get_library()();
  renderLibrary(lib);
}

function renderLibrary(lib) {
  dom.libraryList.innerHTML = "";
  if (lib.length === 0) {
    dom.libraryList.innerHTML =
      "<div style='font-size: 0.8rem; color: #888;'>Library is empty.</div>";
    return;
  }

  lib.forEach((item) => {
    const div = document.createElement("div");
    div.className = "lib-item";
    div.innerHTML = `
            <div class="lib-title">${item.title}</div>
            <div class="lib-actions">
                <button class="lib-btn" title="Load into grid">Load</button>
                <button class="lib-btn" title="Download latest chapter">Latest</button>
                <button class="lib-btn lib-btn-red" title="Remove">X</button>
            </div>
        `;

    const btns = div.querySelectorAll("button");

    // LOAD BUTTON
    btns[0].addEventListener("click", () => {
      dom.linkInput.value = item.link;
      dom.confirmBtn.click();
    });

    // LATEST BUTTON
    btns[1].addEventListener("click", async () => {
      dom.infoBox.innerText = `Fetching data for ${item.title}...`;
      const data = await eel.fetch_cubari_data(item.link)();
      if (data.status === "error" || data.chapters.length === 0) {
        dom.infoBox.innerText = "Error fetching latest chapter.";
        return;
      }
      const latest = data.chapters[data.chapters.length - 1];
      const formatOption = document.querySelector(
        'input[name="naming"]:checked',
      ).value;
      await eel.download_chapters(data.title, [latest], true, formatOption)();
    });

    // REMOVE BUTTON
    btns[2].addEventListener("click", async () => {
      const newLib = await eel.remove_from_library(item.link)();
      renderLibrary(newLib);
    });

    dom.libraryList.appendChild(div);
  });
}

// Add to Library
dom.addLibBtn.addEventListener("click", async () => {
  const link = dom.linkInput.value.trim();
  if (!link) return;
  dom.infoBox.innerText = "Adding to library...";
  const res = await eel.save_to_library(link)();
  if (res.status === "error") {
    dom.infoBox.innerText = res.message;
  } else {
    dom.infoBox.innerText = "Added to library!";
    renderLibrary(res.library);
  }
});

// --- Data Fetching & Rendering ---
dom.confirmBtn.addEventListener("click", async () => {
  const link = dom.linkInput.value.trim();
  if (!link) return;

  dom.infoBox.innerText = "Parsing JSON from link...";
  dom.grid.innerHTML = "";
  selectedChapters.clear();
  allSelected = false;
  dom.selectAllBtn.innerText = "Select All Chapters";
  dom.selectAllBtn.style.display = "none";

  const response = await eel.fetch_cubari_data(link)();

  if (response.status === "error") {
    dom.infoBox.innerText = "Error: " + response.message;
    return;
  }

  globalChapters = response.chapters;
  currentSeriesTitle = response.title;
  globalMainCover = response.cover || "";
  dom.titleEl.innerText = currentSeriesTitle;
  dom.infoBox.innerText = `Found ${globalChapters.length} chapters. Click covers to select.`;

  if (globalChapters.length > 0) {
    dom.selectAllBtn.style.display = "block";
  }

  globalChapters.forEach((chap, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.index = index;

    let targetImgSrc = chap.thumbnail;
    if (!targetImgSrc || chap.is_proxy) targetImgSrc = globalMainCover;

    let imageHtml = targetImgSrc
      ? `<img class="cover-img" src="${targetImgSrc}" onerror="this.outerHTML='<div class=\\'cover-placeholder\\'><span>No Cover</span></div>'" alt="Cover">`
      : `<div class="cover-placeholder"><span>No Cover</span></div>`;

    const pageText = chap.is_proxy
      ? "Proxy Link"
      : `${chap.images.length} Pages`;
    const titleHtml = chap.title
      ? `<div class="chapter-name">(${chap.title})</div>`
      : "";

    card.innerHTML = `
            ${imageHtml}
            <h2>Chapter ${chap.number}</h2>
            ${titleHtml}
            <div class="meta">${pageText}</div>
        `;

    card.addEventListener("click", () => {
      selectedChapters.has(index)
        ? selectedChapters.delete(index)
        : selectedChapters.add(index);
      card.classList.toggle("selected");
      updateSelectionText();
    });

    dom.grid.appendChild(card);
  });
});

// --- UI Logic ---
dom.selectAllBtn.addEventListener("click", () => {
  const allCards = document.querySelectorAll(".card");

  if (!allSelected) {
    globalChapters.forEach((_, i) => selectedChapters.add(i));
    allCards.forEach((card) => card.classList.add("selected"));
    dom.selectAllBtn.innerText = "Deselect All";
  } else {
    selectedChapters.clear();
    allCards.forEach((card) => card.classList.remove("selected"));
    dom.selectAllBtn.innerText = "Select All Chapters";
  }

  allSelected = !allSelected;
  updateSelectionText();
});

function updateSelectionText() {
  dom.infoBox.innerText =
    selectedChapters.size === 0
      ? "Select chapters to download."
      : `${selectedChapters.size} chapters selected. Ready.`;
}

// --- Downloads ---
async function startDownload(asCbz) {
  if (selectedChapters.size === 0) {
    dom.infoBox.innerText = "Please select at least one chapter!";
    return;
  }

  const formatOption = document.querySelector(
    'input[name="naming"]:checked',
  ).value;
  const chaptersToDownload = Array.from(selectedChapters).map(
    (idx) => globalChapters[idx],
  );
  dom.infoBox.innerText = "Initializing download...";

  await eel.download_chapters(
    currentSeriesTitle,
    chaptersToDownload,
    asCbz,
    formatOption,
  )();
}

dom.dlCbzBtn.addEventListener("click", () => startDownload(true));
dom.dlImagesBtn.addEventListener("click", () => startDownload(false));

// --- Background Animation ---
const canvas = document.getElementById("bg-canvas");
const ctx = canvas.getContext("2d");
let width, height, particles;

function initCanvas() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  particles = Array.from({ length: 40 }, () => new Particle());
}

class Particle {
  constructor() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.size = Math.random() * 1.5 + 0.5;
    this.speedX = Math.random() * 0.6 - 0.3;
    this.speedY = Math.random() * 0.6 - 0.3;
    this.color = "rgba(255, 255, 255, 0.15)";
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.x > width) this.x = 0;
    else if (this.x < 0) this.x = width;
    if (this.y > height) this.y = 0;
    else if (this.y < 0) this.y = height;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function animate() {
  ctx.clearRect(0, 0, width, height);
  particles.forEach((p) => {
    p.update();
    p.draw();
  });
  requestAnimationFrame(animate);
}

window.addEventListener("resize", initCanvas);
initCanvas();
animate();

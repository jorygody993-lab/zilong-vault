
const $ = (selector) => document.querySelector(selector);

const photoInput = $("#photoInput");
const uploadBtn = $("#uploadBtn");
const emptyUploadBtn = $("#emptyUploadBtn");
const galleryGrid = $("#galleryGrid");
const emptyState = $("#emptyState");
const searchInput = $("#searchInput");
const photoDialog = $("#photoDialog");

let db;
let currentFilter = "all";
let searchQuery = "";
let objectUrls = new Map();
let toastTimer;

// 1. Membuat database lokal
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ZilongVaultDB", 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("photos")) {
        database.createObjectStore("photos", {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 2. Helper untuk membaca dan menulis database
function getStore(mode = "readonly") {
  const transaction = db.transaction("photos", mode);
  return transaction.objectStore("photos");
}

function getAllPhotos() {
  return new Promise((resolve, reject) => {
    const request = getStore().getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function savePhoto(photo) {
  return new Promise((resolve, reject) => {
    const request = getStore("readwrite").add(photo);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function updatePhoto(photo) {
  return new Promise((resolve, reject) => {
    const request = getStore("readwrite").put(photo);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deletePhotoFromDB(id) {
  return new Promise((resolve, reject) => {
    const request = getStore("readwrite").delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 3. Notifikasi kecil
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// 4. Membuka pemilih foto
function openFilePicker() {
  photoInput.click();
}

uploadBtn.addEventListener("click", openFilePicker);
emptyUploadBtn.addEventListener("click", openFilePicker);

// 5. Mengimpor foto ke database
photoInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  const imageFiles = files.filter((file) =>
    file.type.startsWith("image/")
  );

  if (imageFiles.length === 0) {
    if (files.length > 0) {
      showToast("Pilih file gambar yang valid.");
    }

    photoInput.value = "";
    return;
  }

  let added = 0;

  try {
    for (const file of imageFiles) {
      const photo = {
        name: file.name,
        blob: file,
        favorite: false,
        createdAt: Date.now()
      };

      await savePhoto(photo);
      added++;
    }

    showToast(`${added} foto berhasil ditambahkan.`);
    await renderGallery();
  } catch (error) {
    console.error("Gagal menyimpan foto:", error);
    showToast(
      "Penyimpanan gagal atau ruang browser tidak cukup."
    );
    await renderGallery();
  } finally {
    photoInput.value = "";
  }
});

// 6. Membuat URL sementara untuk menampilkan gambar
function getPhotoUrl(photo) {
  if (!objectUrls.has(photo.id)) {
    objectUrls.set(
      photo.id,
      URL.createObjectURL(photo.blob)
    );
  }

  return objectUrls.get(photo.id);
}

function releaseUnusedUrls(activeIds) {
  for (const [id, url] of objectUrls.entries()) {
    if (!activeIds.has(id)) {
      URL.revokeObjectURL(url);
      objectUrls.delete(id);
    }
  }
}

// 7. Format tanggal
function formatDate(timestamp) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

// 8. Membuat kartu foto
function createPhotoCard(photo) {
  const card = document.createElement("article");
  card.className = "photo-card";

  const image = document.createElement("img");
  image.className = "photo-thumb";
  image.src = getPhotoUrl(photo);
  image.alt = photo.name;
  image.loading = "lazy";

  image.addEventListener("click", () => {
    openPreview(photo);
  });

  const details = document.createElement("div");
  details.className = "photo-details";

  const title = document.createElement("h3");
  title.className = "photo-title";
  title.textContent = photo.name;

  const date = document.createElement("p");
  date.className = "photo-date";
  date.textContent = formatDate(photo.createdAt);

  const actions = document.createElement("div");
  actions.className = "photo-actions";

  const previewButton = document.createElement("button");
  previewButton.className = "icon-btn";
  previewButton.type = "button";
  previewButton.textContent = "⌕";
  previewButton.title = "Lihat foto";
  previewButton.setAttribute("aria-label", "Lihat foto");
  previewButton.addEventListener("click", () => {
    openPreview(photo);
  });

  const favoriteButton = document.createElement("button");
  favoriteButton.className =
    "icon-btn favorite" + (photo.favorite ? " active" : "");
  favoriteButton.type = "button";
  favoriteButton.textContent = photo.favorite ? "★" : "☆";
  favoriteButton.title = "Ubah favorit";
  favoriteButton.setAttribute("aria-label", "Ubah favorit");

  favoriteButton.addEventListener("click", async () => {
    try {
      photo.favorite = !photo.favorite;
      await updatePhoto(photo);
      await renderGallery();
      showToast(
        photo.favorite
          ? "Ditambahkan ke favorit."
          : "Dihapus dari favorit."
      );
    } catch (error) {
      console.error(error);
      showToast("Favorit gagal diperbarui.");
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "icon-btn danger";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.title = "Hapus foto";
  deleteButton.setAttribute("aria-label", "Hapus foto");

  deleteButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      `Hapus "${photo.name}" dari galeri?`
    );

    if (!confirmed) return;

    try {
      await deletePhotoFromDB(photo.id);

      if (objectUrls.has(photo.id)) {
        URL.revokeObjectURL(objectUrls.get(photo.id));
        objectUrls.delete(photo.id);
      }

      if (
        Number($("#dialogImage").dataset.photoId) === photo.id
      ) {
        photoDialog.close();
      }

      await renderGallery();
      showToast("Foto berhasil dihapus.");
    } catch (error) {
      console.error(error);
      showToast("Foto gagal dihapus.");
    }
  });

  actions.append(previewButton, favoriteButton, deleteButton);
  details.append(title, date, actions);
  card.append(image, details);

  return card;
}

// 9. Menampilkan galeri sesuai filter dan pencarian
async function renderGallery() {
  const photos = await getAllPhotos();

  photos.sort((a, b) => b.createdAt - a.createdAt);

  $("#photoCount").textContent = photos.length;
  $("#favoriteCount").textContent =
    photos.filter((photo) => photo.favorite).length;

  let visiblePhotos = photos;

  if (currentFilter === "favorites") {
    visiblePhotos = visiblePhotos.filter(
      (photo) => photo.favorite
    );
  }

  if (currentFilter === "recent") {
    visiblePhotos = visiblePhotos.slice(0, 8);
  }

  if (searchQuery) {
    visiblePhotos = visiblePhotos.filter((photo) =>
      photo.name.toLowerCase().includes(searchQuery)
    );
  }

  galleryGrid.replaceChildren();

  for (const photo of visiblePhotos) {
    galleryGrid.appendChild(createPhotoCard(photo));
  }

  releaseUnusedUrls(
    new Set(visiblePhotos.map((photo) => photo.id))
  );

  emptyState.classList.toggle(
    "visible",
    visiblePhotos.length === 0
  );

  const heading = emptyState.querySelector("h3");
  const paragraph = emptyState.querySelector("p");
  const emptyButton = $("#emptyUploadBtn");

  if (photos.length === 0) {
    heading.textContent = "Your gallery awaits.";
    paragraph.textContent =
      "Belum ada foto. Tambahkan foto pertamamu untuk mulai membangun koleksi.";
    emptyButton.hidden = false;
  } else if (visiblePhotos.length === 0) {
    heading.textContent = "No photos found.";
    paragraph.textContent =
      "Tidak ada foto yang cocok dengan filter atau pencarianmu.";
    emptyButton.hidden = true;
  }
}

// 10. Tombol filter
document.querySelectorAll(".filter-btn").forEach((button) => {
  button.addEventListener("click", async () => {
    currentFilter = button.dataset.filter;

    document.querySelectorAll(".filter-btn").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    await renderGallery();
  });
});

// 11. Pencarian foto
searchInput.addEventListener("input", async () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  await renderGallery();
});

// 12. Preview gambar ukuran besar
function openPreview(photo) {
  $("#dialogImage").src = getPhotoUrl(photo);
  $("#dialogImage").dataset.photoId = photo.id;
  $("#dialogTitle").textContent = photo.name;
  $("#dialogDate").textContent =
    "Added on " + formatDate(photo.createdAt);

  photoDialog.showModal();
}

$("#dialogClose").addEventListener("click", () => {
  photoDialog.close();
});

photoDialog.addEventListener("click", (event) => {
  if (event.target === photoDialog) {
    photoDialog.close();
  }
});

// 13. Memulai aplikasi
async function init() {
  try {
    if (!("indexedDB" in window)) {
      throw new Error("Browser tidak mendukung IndexedDB.");
    }

    db = await openDatabase();
    await renderGallery();
  } catch (error) {
    console.error("Gagal membuka database:", error);
    showToast(
      "Database tidak dapat dibuka. Coba jalankan lewat server lokal."
    );
    emptyState.classList.add("visible");
    emptyState.querySelector("h3").textContent =
      "Storage unavailable.";
    emptyState.querySelector("p").textContent =
      "Periksa dukungan browser dan jalankan website melalui server lokal.";
    $("#emptyUploadBtn").hidden = true;
  }
}

init();
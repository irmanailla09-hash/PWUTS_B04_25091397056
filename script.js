(() => {
  "use strict";

  const main = document.querySelector("#main-content");
  const navLinks = document.querySelector("#nav-links");
  const menuToggle = document.querySelector("#menu-toggle");

  // Fallback contoh jika endpoint PHP/database belum tersedia.
  const demoOrders = [
    {id_pesanan:"KK-1001", tanggal:"2026-10-25", menu:"Nasi Goreng Kampus", total:15000, status_pesanan:"Sedang Diproses", metode_pembayaran:"tunai", status_pembayaran:"Belum Dibayar"},
    {id_pesanan:"KK-1002", tanggal:"2026-10-26", menu:"Es Teh dan Roti Bakar", total:12000, status_pesanan:"Menunggu", metode_pembayaran:"qris", status_pembayaran:"Belum Dibayar"},
    {id_pesanan:"KK-1003", tanggal:"2026-10-20", menu:"Mie Ayam", total:14000, status_pesanan:"Selesai", metode_pembayaran:"transfer", status_pembayaran:"Sudah Dibayar"}
  ];

  const money = n => new Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR", maximumFractionDigits:0}).format(Number(n) || 0);
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

  menuToggle?.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  async function getOrders() {
    try {
      const response = await fetch("api/pesanan.php", {headers:{"Accept":"application/json"}});
      if (!response.ok) throw new Error("Endpoint belum tersedia");
      const data = await response.json();
      if (Array.isArray(data)) return data;
    } catch (error) {
      console.info("Menggunakan data demonstrasi:", error.message);
    }
    return demoOrders;
  }

  async function route() {
    const page = location.hash.slice(1) || "beranda";
    if (!["beranda", "riwayat", "pembayaran"].includes(page)) {
      location.hash = "#beranda";
      return;
    }
    navLinks?.querySelectorAll("a").forEach(a => {
      if (a.getAttribute("href") === `#${page}`) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    navLinks?.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");

    if (page === "beranda") {
      main.innerHTML = document.querySelector("#home-template").innerHTML;
      window.scrollTo(0, 0);
      return;
    }

    try {
      const response = await fetch(`pages/${page}.html`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      main.innerHTML = await response.text();
      if (page === "riwayat") await initHistory();
      if (page === "pembayaran") initPayment();
      window.scrollTo(0, 0);
      main.focus({preventScroll:true});
    } catch (error) {
      console.error(error);
      main.innerHTML = `<section class="panel"><h2>Halaman tidak dapat dimuat</h2><p>Jalankan website melalui XAMPP dan pastikan file pages/${page}.html tersedia.</p></section>`;
    }
  }

  async function initHistory() {
    const search = document.querySelector("#search-order");
    const filter = document.querySelector("#filter-status");
    const list = document.querySelector("#order-list");
    const orders = await getOrders();

    function render() {
      const keyword = search.value.trim().toLowerCase();
      const status = filter.value;
      const filtered = orders.filter(o =>
        String(o.id_pesanan).toLowerCase().includes(keyword) &&
        (!status || o.status_pesanan === status)
      );
      if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Tidak ada pesanan yang cocok.</div>`;
        return;
      }
      list.innerHTML = filtered.map(o => {
        const statusClass = o.status_pesanan === "Selesai" ? "selesai" : o.status_pesanan === "Dibatalkan" ? "dibatalkan" : "";
        return `<article class="order-card">
          <div class="order-top"><div><h3>Pesanan ${escapeHTML(o.id_pesanan)}</h3><p>${escapeHTML(o.tanggal || "-")} · ${escapeHTML(o.menu || "Menu pesanan")}</p></div><span class="status ${statusClass}">${escapeHTML(o.status_pesanan || "Menunggu")}</span></div>
          <p class="order-total">Total: ${money(o.total)}</p>
          <p>Pembayaran: ${escapeHTML(o.status_pembayaran || "Belum Dibayar")}</p>
          <a href="#pembayaran">Catat pembayaran →</a>
        </article>`;
      }).join("");
    }
    search.addEventListener("input", render);
    filter.addEventListener("change", render);
    render();
  }

  function initPayment() {
    const form = document.querySelector("#payment-form");
    const message = document.querySelector("#payment-message");
    const id = document.querySelector("#id-pesanan");
    const metode = document.querySelector("#metode");
    const nominal = document.querySelector("#nominal");
    const errors = {
      id: document.querySelector("#id-pesanan-error"),
      metode: document.querySelector("#metode-error"),
      nominal: document.querySelector("#nominal-error")
    };

    form.addEventListener("submit", async event => {
      event.preventDefault();
      Object.values(errors).forEach(el => el.textContent = "");
      message.hidden = true;
      let firstInvalid = null;
      const orderId = id.value.trim().toUpperCase();
      const amount = Number(nominal.value);

      if (!/^KK-\d{4,}$/.test(orderId)) {
        errors.id.textContent = "Gunakan format ID pesanan seperti KK-1001.";
        firstInvalid ||= id;
      }
      if (!["tunai","transfer","qris"].includes(metode.value)) {
        errors.metode.textContent = "Pilih salah satu metode pembayaran.";
        firstInvalid ||= metode;
      }
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
        errors.nominal.textContent = "Nominal harus berupa angka bulat lebih besar dari nol.";
        firstInvalid ||= nominal;
      }
      if (firstInvalid) { firstInvalid.focus(); return; }

      const orders = await getOrders();
      const order = orders.find(o => String(o.id_pesanan).toUpperCase() === orderId);
      if (!order) {
        errors.id.textContent = "ID tidak ditemukan pada data pesanan yang tersedia.";
        id.focus();
        return;
      }
      if (Number(order.total) !== amount) {
        errors.nominal.textContent = `Total tidak sesuai. Total pesanan adalah ${money(order.total)}.`;
        nominal.focus();
        return;
      }

      const payload = {id_pesanan:orderId, metode_pembayaran:metode.value, total_pembayaran:amount};
      try {
        const response = await fetch("api/pembayaran.php", {
          method:"POST",
          headers:{"Content-Type":"application/json","Accept":"application/json"},
          body:JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Server belum menerima data.");
        message.textContent = data.message;
      } catch (error) {
        // Simulasi lokal agar alur UI bisa dicoba; ini bukan penyimpanan server.
        try {
          const saved = JSON.parse(localStorage.getItem("kantinkita-pembayaran-demo") || "{}");
          saved[orderId] = {...payload, status_pembayaran:"Menunggu konfirmasi (simulasi)", tanggal:new Date().toISOString()};
          localStorage.setItem("kantinkita-pembayaran-demo", JSON.stringify(saved));
        } catch (_) {}
        message.textContent = `Data ${orderId} lolos validasi dan tersimpan sebagai simulasi browser. Server belum terhubung, jadi data belum dikirim ke database.`;
      }
      message.hidden = false;
    });
  }

  window.addEventListener("hashchange", route);
  route();
})();

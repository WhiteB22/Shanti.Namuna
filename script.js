const api = {
  async request(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  },
  getEvents(type = "all") {
    return this.request(`/api/events?type=${encodeURIComponent(type)}`);
  },
  createEvent(payload) {
    return this.request("/api/events", { method: "POST", body: JSON.stringify(payload) });
  },
  submitAdmission(payload) {
    return this.request("/api/admissions", { method: "POST", body: JSON.stringify(payload) });
  },
  estimateFee(payload) {
    return this.request("/api/fees/estimate", { method: "POST", body: JSON.stringify(payload) });
  },
  submitContact(payload) {
    return this.request("/api/contact", { method: "POST", body: JSON.stringify(payload) });
  },
  getStats() {
    return this.request("/api/stats");
  },
  getAdmissions(limit = 5) {
    return this.request(`/api/admissions?limit=${limit}`);
  },
  getContacts(limit = 5) {
    return this.request(`/api/contact?limit=${limit}`);
  }
};

const admissionForm = document.getElementById("admissionForm");
const admissionMessage = document.getElementById("admissionMessage");
const feeForm = document.getElementById("feeForm");
const feeResult = document.getElementById("feeResult");
const eventsList = document.getElementById("eventsList");
const eventFilter = document.getElementById("eventFilter");
const contactForm = document.getElementById("contactForm");
const contactFeedback = document.getElementById("contactFeedback");
const eventForm = document.getElementById("eventForm");
const eventFeedback = document.getElementById("eventFeedback");
const latestAdmissions = document.getElementById("latestAdmissions");
const latestMessages = document.getElementById("latestMessages");
const refreshBtn = document.getElementById("refreshDashboard");
const navLinks = document.getElementById("navLinks");
const menuButton = document.getElementById("menuButton");

function setMessage(element, message, isSuccess) {
  element.textContent = message;
  element.classList.remove("success", "error");
  element.classList.add(isSuccess ? "success" : "error");
}

function setButtonBusy(button, isBusy, label) {
  if (!button) return;
  button.disabled = isBusy;
  if (label) button.textContent = label;
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function renderEvents(events) {
  eventsList.innerHTML = "";
  if (!events.length) {
    eventsList.innerHTML = '<article class="card"><p>No events found for this category.</p></article>';
    return;
  }

  events.forEach((event) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <h3>${event.title}</h3>
      <p><strong>${formatDate(event.date)}</strong> • ${event.type.toUpperCase()}</p>
      <p>${event.description}</p>
      <p><small>ID: ${event.id}</small></p>
    `;
    eventsList.appendChild(card);
  });
}

function animateCounters() {
  document.querySelectorAll("[data-counter]").forEach((counter) => {
    const target = Number(counter.dataset.counter);
    let current = 0;
    const increment = Math.ceil(target / 40);
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      counter.textContent = current;
    }, 30);
  });
}

async function refreshDashboard() {
  try {
    const [stats, admissions, contacts] = await Promise.all([
      api.getStats(),
      api.getAdmissions(5),
      api.getContacts(5)
    ]);

    document.getElementById("admissionsCount").textContent = stats.admissions;
    document.getElementById("messagesCount").textContent = stats.messages;
    document.getElementById("eventsCount").textContent = stats.events;

    latestAdmissions.innerHTML = "";
    admissions
      .slice()
      .reverse()
      .forEach((entry) => {
        const li = document.createElement("li");
        li.textContent = `${entry.studentName} • Grade ${entry.grade} • ${entry.id}`;
        latestAdmissions.appendChild(li);
      });

    latestMessages.innerHTML = "";
    contacts
      .slice()
      .reverse()
      .forEach((entry) => {
        const li = document.createElement("li");
        li.textContent = `${entry.name} • ${entry.email}`;
        latestMessages.appendChild(li);
      });
  } catch (error) {
    setMessage(eventFeedback, `Dashboard error: ${error.message}`, false);
  }
}

async function loadEvents() {
  try {
    renderEvents(await api.getEvents(eventFilter.value || "all"));
  } catch (error) {
    eventsList.innerHTML = `<article class="card"><p>${error.message}</p></article>`;
  }
}

admissionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = admissionForm.querySelector('button[type="submit"]');
  setButtonBusy(submit, true, "Submitting...");

  try {
    const payload = {
      studentName: document.getElementById("studentName").value.trim(),
      grade: document.getElementById("grade").value,
      parentEmail: document.getElementById("parentEmail").value.trim(),
      contact: document.getElementById("contact").value.trim()
    };
    const result = await api.submitAdmission(payload);
    setMessage(admissionMessage, `${result.message} ID: ${result.applicationId}`, true);
    admissionForm.reset();
    await refreshDashboard();
  } catch (error) {
    setMessage(admissionMessage, error.message, false);
  } finally {
    setButtonBusy(submit, false, "Submit Application");
  }
});

feeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = feeForm.querySelector('button[type="submit"]');
  setButtonBusy(submit, true, "Calculating...");

  try {
    const payload = {
      grade: document.getElementById("feeGrade").value,
      transport: document.getElementById("transport").checked,
      meal: document.getElementById("meal").checked,
      hostel: document.getElementById("hostel").checked
    };
    const result = await api.estimateFee(payload);
    feeResult.textContent = `Estimated Monthly Fee: $${result.total} (Base: $${result.baseFee})`;
  } catch (error) {
    feeResult.textContent = error.message;
  } finally {
    setButtonBusy(submit, false, "Calculate Fee");
  }
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = contactForm.querySelector('button[type="submit"]');
  setButtonBusy(submit, true, "Sending...");

  try {
    const payload = {
      name: document.getElementById("contactName").value.trim(),
      email: document.getElementById("contactEmail").value.trim(),
      message: document.getElementById("contactMessage").value.trim()
    };
    const result = await api.submitContact(payload);
    setMessage(contactFeedback, result.message, true);
    contactForm.reset();
    await refreshDashboard();
  } catch (error) {
    setMessage(contactFeedback, error.message, false);
  } finally {
    setButtonBusy(submit, false, "Send Message");
  }
});

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = eventForm.querySelector('button[type="submit"]');
  setButtonBusy(submit, true, "Creating...");

  try {
    const payload = {
      title: document.getElementById("eventTitle").value.trim(),
      date: document.getElementById("eventDate").value,
      type: document.getElementById("eventType").value,
      description: document.getElementById("eventDescription").value.trim()
    };
    await api.createEvent(payload);
    setMessage(eventFeedback, "Event created successfully.", true);
    eventForm.reset();
    eventFilter.value = "all";
    await loadEvents();
    await refreshDashboard();
  } catch (error) {
    setMessage(eventFeedback, error.message, false);
  } finally {
    setButtonBusy(submit, false, "Create Event");
  }
});

eventFilter.addEventListener("change", loadEvents);
refreshBtn.addEventListener("click", refreshDashboard);
menuButton.addEventListener("click", () => navLinks.classList.toggle("open"));

document.getElementById("year").textContent = new Date().getFullYear();
animateCounters();
loadEvents();
refreshDashboard();

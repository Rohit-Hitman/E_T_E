const personForm = document.querySelector("#person-form");
const nameInput = document.querySelector("#name-input");
const submitButton = document.querySelector("#submit-button");
const formFeedback = document.querySelector("#form-feedback");
const peopleList = document.querySelector("#people-list");
const searchInput = document.querySelector("#search-input");
const refreshButton = document.querySelector("#refresh-button");
const connection = document.querySelector(".connection");
const connectionLabel = document.querySelector("#connection-label");
const peopleCount = document.querySelector("#people-count");
const latestEntry = document.querySelector("#latest-entry");
const listCount = document.querySelector("#list-count");
const characterCount = document.querySelector("#character-count");

let people = [];

async function request(path, options) {
  const response = await fetch(path, options);
  const responseText = await response.text();
  let payload = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload.detail === "string"
        ? payload.detail
        : `The request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload;
}

function setConnectionState(isConnected) {
  connection.classList.toggle("is-connected", isConnected);
  connection.classList.toggle("is-offline", !isConnected);
  connectionLabel.textContent = isConnected ? "All connected" : "Connection issue";
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function avatarTone(name) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % 5;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatTime(value);
}

function makePersonRow(person, index) {
  const row = document.createElement("article");
  row.className = "person-row";
  row.style.animationDelay = `${Math.min(index, 8) * 35}ms`;

  const avatar = document.createElement("div");
  avatar.className = `person-avatar avatar-tone-${avatarTone(person.name)}`;
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = initials(person.name);

  const main = document.createElement("div");
  main.className = "person-main";

  const name = document.createElement("p");
  name.className = "person-name";
  name.textContent = person.name;

  const subtitle = document.createElement("p");
  subtitle.className = "person-subtitle";
  subtitle.textContent = "A new connection";

  const time = document.createElement("time");
  time.className = "person-date";
  time.dateTime = person.time;
  time.textContent = formatTime(person.time);
  time.title = new Date(person.time).toLocaleString();

  main.append(name, subtitle);
  row.append(avatar, main, time);
  return row;
}

function renderPeople() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filteredPeople = people.filter((person) =>
    person.name.toLocaleLowerCase().includes(query),
  );

  peopleList.replaceChildren();
  peopleCount.textContent = String(people.length);
  listCount.textContent = `${filteredPeople.length} ${
    filteredPeople.length === 1 ? "person" : "people"
  }`;

  const newest = people[0];
  latestEntry.textContent = newest ? formatRelativeTime(newest.time) : "No entries yet";

  if (filteredPeople.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";

    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = query ? "⌕" : "✳";

    const title = document.createElement("strong");
    title.textContent = query ? "No names found" : "Your circle starts here";

    const description = document.createElement("span");
    description.textContent = query
      ? "Try a different search."
      : "Add someone you’d like to remember.";

    emptyState.append(icon, title, description);
    peopleList.append(emptyState);
    return;
  }

  filteredPeople.forEach((person, index) => {
    peopleList.append(makePersonRow(person, index));
  });
}

async function loadPeople() {
  peopleList.innerHTML = `
    <div class="list-loading">
      <span class="loading-spinner"></span>
      <span>Gathering your people…</span>
    </div>`;
  listCount.textContent = "Refreshing…";

  try {
    const records = await request("/people");
    if (!Array.isArray(records)) {
      throw new Error("The server returned an unexpected response.");
    }
    people = records.sort(
      (left, right) => new Date(right.time).getTime() - new Date(left.time).getTime(),
    );
    setConnectionState(true);
    renderPeople();
  } catch (error) {
    setConnectionState(false);
    peopleList.replaceChildren();
    const message = document.createElement("div");
    message.className = "list-error";

    const description = document.createElement("span");
    description.textContent = "We couldn’t load your directory.";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", loadPeople, { once: true });

    message.append(description, retry);
    peopleList.append(message);
    listCount.textContent = error.message || "Unable to load";
    peopleCount.textContent = "—";
    latestEntry.textContent = "—";
  }
}

function showFeedback(message, isError = false) {
  formFeedback.textContent = message;
  formFeedback.classList.toggle("is-error", isError);
}

nameInput.addEventListener("input", () => {
  characterCount.textContent = `${nameInput.value.length} / 100`;
  formFeedback.textContent = "";
  formFeedback.classList.remove("is-error");
});

searchInput.addEventListener("input", renderPeople);

refreshButton.addEventListener("click", () => {
  refreshButton.classList.add("is-spinning");
  loadPeople().finally(() => {
    window.setTimeout(() => refreshButton.classList.remove("is-spinning"), 350);
  });
});

personForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();

  if (!name) {
    showFeedback("Add a name to get started.", true);
    nameInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector(".button-label").textContent = "Adding to your circle…";
  showFeedback("");

  try {
    await request("/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    personForm.reset();
    characterCount.textContent = "0 / 100";
    showFeedback(`${name} is in your circle.`);
    await loadPeople();
    nameInput.focus();
  } catch (error) {
    showFeedback(error.message || "We couldn’t save that name. Please try again.", true);
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector(".button-label").textContent = "Add to your circle";
  }
});

loadPeople();

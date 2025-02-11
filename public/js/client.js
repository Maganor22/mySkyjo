const ws = new WebSocket(`ws://${window.location.host}`);
const messageInput = document.getElementById("message");
const roomControls = document.getElementById("room-controls");
const gameControls = document.getElementById("game-controls");
const startButton = document.getElementById("startButton");
const roomInfo = document.getElementById("room-info");
const playersHandsDiv = document.getElementById("players-hands");
const gameDisplay = document.querySelector(".game_display");
const deckDiv = document.getElementById("deck");
const discardPileDiv = document.getElementById("discard-pile");
let gameStarted = false;
let gameLaunched = false;
let currentPseudo = "";
let currentTurnPlayer = "";
let isPlayerTurn = false;
let drawnCard = null;
let isCardDrawn = false;
let hasDiscarded = false;
let drawSource = null; // 'deck' ou 'discard'
let lastRoundTriggered = false;
let isLastRound = false;
let chooseCardCount = 0;

const cardPioche = document.createElement("img");
cardPioche.classList.add("card_pioche", "cursor_pointer", "rounded");
deckDiv.appendChild(cardPioche);

const cardDefausse = document.createElement("img");
cardDefausse.classList.add("card_defausse", "cursor_pointer", "rounded");
discardPileDiv.appendChild(cardDefausse);

deckDiv.addEventListener("click", function () {
  if (!isPlayerTurn) {
    appendLog("Ce n'est pas votre tour");
    return;
  }

  if (!isCardDrawn && !drawnCard) {
    appendLog("Pioche depuis le deck");
    drawSource = "deck";
    ws.send(JSON.stringify({ type: "draw-card" }));
  }
});

discardPileDiv.addEventListener("click", function () {
  if (!isPlayerTurn) {
    appendLog("Ce n'est pas votre tour");
    return;
  }

  if (isCardDrawn || drawnCard) {
    // Si on a déjà une carte en main, on peut la défausser
    if (drawnCard) {
      if (drawSource === "discard") {
        // Si la carte vient de la défausse, on la repose et on ne peut que piocher
        appendLog(
          "Carte de la défausse reposée - vous devez piocher une nouvelle carte de la pioche"
        );
        ws.send(
          JSON.stringify({
            type: "discard-drawn-card",
            card: drawnCard,
            pseudo: currentPseudo,
            fromDiscard: true,
          })
        );
      } else {
        // Si la carte vient de la pioche, on peut la défausser et retourner une carte
        appendLog("Défausse de la carte piochée");
        ws.send(
          JSON.stringify({
            type: "discard-drawn-card",
            card: drawnCard,
            pseudo: currentPseudo,
            fromDiscard: false,
          })
        );
      }
    }
  } else {
    // Sinon, on peut piocher depuis la défausse
    appendLog("Pioche depuis la défausse");
    drawSource = "discard";
    ws.send(
      JSON.stringify({
        type: "draw-from-discard",
        pseudo: currentPseudo,
      })
    );
  }
});

// Ajouter une div pour afficher la carte piochée
const drawnCardDisplay = document.createElement("div");
drawnCardDisplay.id = "drawn-card-display";
drawnCardDisplay.style.display = "none";
drawnCardDisplay.classList.add("drawn-card");
gameDisplay.appendChild(drawnCardDisplay);

// Ajouter au début du fichier
const logTextArea = document.createElement("textarea");
logTextArea.id = "game-logs";
logTextArea.readOnly = true;
logTextArea.style.width = "100%";
logTextArea.style.height = "100px";
logTextArea.style.marginTop = "10px";
document.body.appendChild(logTextArea);

function appendLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  logTextArea.value += `[${timestamp}] ${message}\n`;
  logTextArea.scrollTop = logTextArea.scrollHeight;
}

// function calculatePoints(hand) {
//   return hand.reduce((total, card) => {
//     // Ajouter les points seulement si la carte est visible et non complétée
//     if (card.visible && !card.columnCompleted) {
//       return total + parseInt(card.value);
//     }
//     return total;
//   }, 0);
// }
function calculatePoints(hand) {
  return hand.reduce((total, card) => {
    if (card.visible) {
      return total + (card.value || 0); // Assurez-vous que card.value est défini
    }
    return total;
  }, 0);
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`Message received by client: ${data.type}`);
  if (data.type === "game-over") {
    // Vérifiez que les résultats sont définis et sont un tableau
    if (!data.results || !Array.isArray(data.results)) {
      console.error("Invalid players data: undefined");
      console.log("Received data:", data); // Log des données reçues
      return;
    }

    // Vérifiez chaque joueur
    data.results.forEach((player) => {
      if (
        !player.pseudo ||
        player.score === undefined ||
        !Array.isArray(player.hand)
      ) {
        console.error("Invalid player data:", player);
        return;
      }
    });

    // Continuez avec le traitement des données des joueurs
    displayPlayersHands(data.results);
  }
  switch (data.type) {
    case "room-created":
      roomInfo.textContent = `Room ID: ${data.roomId}`;
      roomControls.style.display = "none";
      gameControls.style.display = "block";
      roomInfo.innerHTML = `
    Room ID: <input type="text" id="roomIdInput" value="${data.roomId}" readonly />
    <button id="copyRoomIdButton" onclick="copyRoomId()">Copier</button>
  `;

      // Assurez-vous que l'input est mis à jour après l'ajout au DOM
      const roomIdInput = document.getElementById("roomIdInput");
      roomIdInput.value = data.roomId; // Assigner la valeur ici

      appendMessage(`Salle créée – Room ID: ${data.roomId}`);
      break;

    case "room-joined":
      roomControls.style.display = "none";
      gameControls.style.display = "block";
      startButton.style.display = "none";
      appendMessage("Vous avez rejoint la salle !");
      break;

    case "player-joined":
      appendMessage(`Players: ${data.players.join(", ")}`);
      break;

    case "player-left":
      appendMessage(`Players: ${data.players.join(", ")}`);
      break;

    case "game-started":
      appendMessage("The game has started!");
      roomInfo.style.display = "none";
      startButton.style.display = "none";
      gameDisplay.style.display = "block";
      if (data.players) {
        displayPlayersHands(data.players);
        displayGameArea(data.deckSize, data.discardPile);
        isPlayerTurn = data.players.find(
          (player) => player.pseudo === currentPseudo
        ).isTurn;
      }
      break;

    case "game-launched":
      gameStarted = true;
      gameLaunched = true;
      appendMessage("The game has been launched!");
      if (data.players) {
        isPlayerTurn = data.currentPlayer === currentPseudo;
        currentTurnPlayer = data.currentPlayer;
        updateTurnDisplay(data.currentPlayer);
        console.log("Game launched:", {
          currentPlayer: data.currentPlayer,
          isPlayerTurn,
          currentPseudo,
        });
      }
      break;

    case "update-hands":
      console.log("Updating hands:", data);
      displayPlayersHands(data.players);
      break;

    case "card-flipped":
      updateFlippedCard(data.cardId, data.image, data.value);
      displayPlayersHands(data.players);
      appendMessage(`${data.pseudo} a retourné une carte`);
      break;

    case "last-round-trigger":
      appendMessage(data.message);
      break;

    case "turn-ended":
      console.log(`${data.player} a terminé son tour.`);
      // appendMessage(`${data.player} a terminé son tour.`);

      // Retourner toutes les cartes du joueur qui vient de terminer son tour
      const endedPlayer = data.players.find(
        (player) => player.pseudo === data.player
      );
      if (endedPlayer) {
        endedPlayer.hand.forEach((card) => {
          card.visible = true; // Retourner la carte
        });
      }

      // Passer au joueur suivant
      const nextPlayerIndex =
        (data.players.findIndex((player) => player.pseudo === data.player) +
          1) %
        data.players.length;
      const nextPlayer = data.players[nextPlayerIndex];

      // Informer le prochain joueur que c'est son tour
      if (nextPlayer) {
        console.log(`C'est le tour de ${nextPlayer.pseudo}.`);
        appendMessage(`C'est le tour de ${nextPlayer.pseudo}.`);
        // Mettre à jour l'affichage du tour
        updateTurnDisplay(nextPlayer.pseudo);
      }
      break;

    case "next-turn":
      console.log(`Case next turn: ${data.currentPlayer}`);
      currentTurnPlayer = data.currentPlayer;
      isPlayerTurn = currentPseudo === data.currentPlayer;

      // Réinitialiser l'état pour le nouveau tour
      isCardDrawn = false;
      drawnCard = null;
      hasDiscarded = false;
      drawSource = null;

      // Retourner toutes les cartes du joueur
      if (isPlayerTurn) {
        const playerHand = data.players.find(
          (player) => player.pseudo === currentPseudo
        ).hand;
        playerHand.forEach((card) => {
          if (!card.visible) {
            card.visible = true; // Retourner la carte
          }
        });
      }

      updateTurnDisplay(data.currentPlayer);
      updateAvailableActions();
      break;

    case "card-drawn":
      drawnCardDisplay.innerHTML = "";
      const cardImg = document.createElement("img");
      cardImg.src = data.card.image;
      cardImg.classList.add("card", "rounded");
      drawnCardDisplay.appendChild(cardImg);
      drawnCardDisplay.style.display = "block";

      if (data.player === currentPseudo) {
        drawnCard = data.card;
        isCardDrawn = true;
        drawSource = "deck";
        appendMessage(`Vous avez pioché un ${data.card.value}`);
      } else {
        appendMessage(`${data.player} a pioché un ${data.card.value}`);
      }

      updateAvailableActions();
      break;

    case "card-discarded":
      appendMessage(`${data.player} a défaussé une carte.`);
      displayGameArea(data.deckSize, data.discardPile);
      break;

    case "card-replaced":
      console.log("Card replaced");
      displayPlayersHands(data.players);
      displayGameArea(data.deckSize, data.discardPile);
      isCardDrawn = false;
      drawnCard = null;
      drawnCardDisplay.style.display = "none";
      appendMessage(`${data.pseudo} a remplacé une carte.`);
      break;

    case "drawn-card-discarded":
      appendMessage("Carte piochée défaussée");
      displayGameArea(data.deckSize, data.discardPile);
      isCardDrawn = false;
      drawnCard = null;
      hasDiscarded = true;
      drawnCardDisplay.style.display = "none";
      updateAvailableActions();
      break;

    case "card-drawn-from-discard":
      drawnCard = data.card;
      isCardDrawn = true;
      drawSource = "discard";
      drawnCardDisplay.innerHTML = "";
      const discardCardImg = document.createElement("img");
      discardCardImg.src = data.card.image;
      discardCardImg.classList.add("card", "rounded");
      drawnCardDisplay.appendChild(discardCardImg);
      drawnCardDisplay.style.display = "block";

      if (data.player === currentPseudo) {
        appendMessage("Vous avez pioché une carte de la défausse");
      } else {
        appendMessage(`${data.player} a pioché une carte de la défausse`);
      }
      updateAvailableActions();
      break;

    case "column-update":
      displayPlayersHands(data.players);
      displayGameArea(null, data.discardPile);
      if (data.completedValue) {
        appendMessage(`Une colonne de ${data.completedValue} a été complétée!`);
      }
      break;

    // Le serveur indique que c'est le dernier tour (le joueur qui déclenche son dernier retournement a lancé cette étape)
    case "last-round":
      appendMessage(data.message);
      break;

    // Une fois le dernier tour terminé, le serveur envoie l'issue de la partie
    case "game-over":
      console.log("Game over received:", data);
      if (data.results && Array.isArray(data.results)) {
        displayPlayersHands(data.results);
        showGameOverPopup(data.winner, data.results);
      } else {
        console.error("Invalid game-over data:", data);
      }
      break;

    case "error":
      console.error(`Error received: ${data.message}`);
      appendMessage(`Error: ${data.message}`);
      break;

    default:
      console.log(`Unknown message type received by client: ${data.type}`);
      if (data.type === "message") {
        appendMessage(data.message);
      }
      break;
  }
};

function drawCard() {
  if (!isPlayerTurn || isCardDrawn) return;

  ws.send(JSON.stringify({ type: "draw-card" }));
}

function drawFromDiscard() {
  if (!isPlayerTurn || isCardDrawn) return;

  ws.send(
    JSON.stringify({
      type: "draw-from-discard",
      pseudo: currentPseudo,
    })
  );
}

function discardCard(card) {
  ws.send(JSON.stringify({ type: "discard-card", card }));
}

function copyRoomId() {
  const roomIdInput = document.getElementById("roomIdInput");

  if (!roomIdInput) {
    console.error("L'élément avec l'ID roomIdInput n'existe pas.");
    return;
  }

  roomIdInput.select();
  roomIdInput.setSelectionRange(0, 99999); // Pour les appareils mobiles

  const roomIdValue = roomIdInput.value;
  console.log("Valeur de roomIdInput :", roomIdValue); // Vérifiez la valeur dans la console

  navigator.clipboard
    .writeText(roomIdValue)
    .then(() => {
      appendMessage(`ID de la salle copié ! ${roomIdValue}`);
    })
    .catch((err) => {
      console.error("Erreur lors de la copie : ", err);
    });
}

function displayGameArea(deckSize, discardPile = []) {
  if (deckSize > 0) {
    cardPioche.src = "/images/back.png";
  }

  if (discardPile.length > 0) {
    const topCard = discardPile[discardPile.length - 1];
    console.log("Updating discard pile with top card:", topCard);
    cardDefausse.src = topCard.image;
  } else {
    cardDefausse.src = "";
  }
}

function createRoom() {
  const pseudo = document.getElementById("pseudoInput").value;
  if (pseudo) {
    currentPseudo = pseudo;
    ws.send(JSON.stringify({ type: "create-room", pseudo }));
  } else {
    alert("Please enter a pseudo");
  }
}

function joinRoom() {
  const roomId = document.getElementById("roomIdInput").value;
  const pseudo = document.getElementById("pseudoInput").value;
  if (roomId && pseudo) {
    currentPseudo = pseudo;
    ws.send(JSON.stringify({ type: "join-room", roomId, pseudo }));
  } else {
    alert("Please enter a room ID and a pseudo");
  }
}

function sendMessage() {
  const message = messageInput.value;
  ws.send(JSON.stringify({ type: "message", message }));
  messageInput.value = "";
}

function startGame() {
  ws.send(JSON.stringify({ type: "start-game" }));
}

function launchGame() {
  ws.send(JSON.stringify({ type: "launch-game" }));
}

function appendMessage(message) {
  appendLog(message);
  const messageDiv = document.createElement("div");
  messageDiv.textContent = message;
  messageDiv.style.position = "fixed";
  messageDiv.style.top = "20px";
  messageDiv.style.left = "50%";
  messageDiv.style.transform = "translateX(-50%)";
  messageDiv.style.padding = "15px 25px";
  messageDiv.style.backgroundColor = "#2c3e50";
  messageDiv.style.color = "#ecf0f1";
  messageDiv.style.borderRadius = "8px";
  messageDiv.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
  messageDiv.style.zIndex = "1000";
  messageDiv.style.fontWeight = "500";
  document.body.appendChild(messageDiv);

  setTimeout(() => {
    messageDiv.style.transition = "opacity 0.5s ease-out";
    messageDiv.style.opacity = "0";
    setTimeout(() => messageDiv.remove(), 500);
  }, 2000);
}

function displayPlayersHands(players) {
  playersHandsDiv.innerHTML = "";
  players.forEach((player) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "hand";
    // On identifie la main par le pseudo du joueur
    playerDiv.dataset.pseudo = player.pseudo;

    // Pour les mains des adversaires, on ajoute toujours la classe "dim"
    if (player.pseudo !== currentPseudo) {
      playerDiv.classList.add("dim");
    }

    const playerInfoDiv = document.createElement("div");
    playerInfoDiv.className = "player-info";

    const playerName = document.createElement("h3");
    playerName.textContent = player.pseudo;
    playerName.dataset.pseudo = player.pseudo;

    // Ici, vous pouvez conserver le coloriage des pseudos selon vos critères
    if (gameLaunched) {
      if (player.pseudo === currentPseudo) {
        playerName.style.color = isPlayerTurn ? "#27ae60" : "#c0392b";
      } else {
        playerName.style.color = isPlayerTurn
          ? "#c0392b"
          : player.pseudo === currentTurnPlayer
          ? "#27ae60"
          : "#c0392b";
      }
    } else {
      playerName.style.color = "white";
    }

    const points = calculatePoints(player.hand);
    const pointsDisplay = document.createElement("span");
    pointsDisplay.className = "points-display";
    pointsDisplay.textContent = `Points : ${points}`;
    pointsDisplay.style.marginLeft = "20px";

    playerInfoDiv.appendChild(playerName);
    playerInfoDiv.appendChild(pointsDisplay);
    playerDiv.appendChild(playerInfoDiv);

    const deckContainer = document.createElement("div");
    deckContainer.className = "deck-row";

    // Création de la grille de cartes (colonnes et lignes)
    const cardGrid = Array(4)
      .fill()
      .map(() => Array(3).fill(null));
    player.hand.forEach((card, index) => {
      const col = Math.floor(index / 3);
      const row = index % 3;
      cardGrid[col][row] = card;
    });

    // Pour chaque colonne
    for (let col = 0; col < 4; col++) {
      const column = document.createElement("div");
      column.className = "deck-column";

      // Vérifier la complétude de la colonne
      const columnCards = cardGrid[col];
      const isColumnComplete = columnCards.every(
        (card) =>
          card &&
          card.visible &&
          columnCards[0] &&
          card.value === columnCards[0].value
      );
      const isAlreadyCompleted = columnCards.every(
        (card) => card && card.columnCompleted
      );

      for (let row = 0; row < 3; row++) {
        const card = cardGrid[col][row];
        if (card) {
          const cardImg = document.createElement("img");
          cardImg.classList.add("card", "rounded");
          cardImg.src = card.visible ? card.image : "/images/back.png";

          cardImg.dataset.image = card.image;
          cardImg.dataset.value = card.value;
          cardImg.dataset.visible = card.visible;
          cardImg.dataset.id = card.id;
          cardImg.dataset.owner = player.pseudo;
          cardImg.dataset.column = col;

          if (isColumnComplete || isAlreadyCompleted) {
            cardImg.style.filter = "grayscale(100%)";
            cardImg.style.opacity = "0.7";
            cardImg.classList.remove("cursor_pointer");
          } else {
            cardImg.classList.add("cursor_pointer");
            cardImg.addEventListener("click", flipCard);
          }
          column.appendChild(cardImg);
        }
      }

      if (
        isColumnComplete &&
        !isAlreadyCompleted &&
        player.pseudo === currentPseudo
      ) {
        ws.send(
          JSON.stringify({
            type: "column-completed",
            column: col,
            value: columnCards[0].value,
            pseudo: player.pseudo,
          })
        );
        appendLog(
          `Colonne ${col + 1} complétée avec trois ${columnCards[0].value}!`
        );
      }

      deckContainer.appendChild(column);
    }

    playerDiv.appendChild(deckContainer);
    playersHandsDiv.appendChild(playerDiv);
  });
}

function flipCard(event) {
  console.log("FLIP CARD");
  const card = event.target;
  const visible = card.dataset.visible === "true";
  const owner = card.dataset.owner;

  // Récupérer l'élément du joueur
  const playerElement = document.querySelector(
    `[data-pseudo='${currentPseudo}']`
  );

  // Vérifiez si playerElement est valide
  if (!playerElement) {
    console.log("playerElement est introuvable.");
    return; // Sortir si l'élément n'est pas trouvé
  }

  console.log(
    `Carte cliquée - Phase: ${
      gameLaunched ? "jeu" : "initiale"
    }, Propriétaire: ${owner}`
  );

  if (owner !== currentPseudo) {
    console.log("Ce n'est pas votre carte");
    return;
  }

  if (!gameLaunched) {
    console.log("Phase initiale");
    if (chooseCardCount >= 2 || visible) {
      console.log("Impossible de retourner plus de cartes en phase initiale");
      return;
    }

    chooseCardCount++;

    ws.send(
      JSON.stringify({
        type: "flip-card",
        cardId: card.dataset.id,
        image: card.dataset.image,
        value: card.dataset.value,
        pseudo: currentPseudo,
        // chooseCard: chooseCardCount,
      })
    );

    // Mettre à jour l'état de la carte
    card.src = card.dataset.image;
    card.dataset.visible = "true";
  } else {
    if (!isPlayerTurn) {
      console.log("Ce n'est pas votre tour");
      return;
    }

    if (drawSource === "deck" && !isCardDrawn && !drawnCard && !hasDiscarded) {
      console.log("Vous devez d'abord piocher une carte !");
      appendMessage("Vous devez d'abord piocher une carte !");
      return;
    }

    if (drawnCard) {
      console.log("Remplacement de la carte par celle piochée");
      ws.send(
        JSON.stringify({
          type: "replace-card",
          oldCardId: card.dataset.id,
          newCard: drawnCard,
          pseudo: currentPseudo,
          // chooseCard: chooseCardCount,
        })
      );
    } else if (!visible && (hasDiscarded || drawSource === "deck")) {
      console.log("Retournement de carte après défausse");
      ws.send(
        JSON.stringify({
          type: "flip-card",
          cardId: card.dataset.id,
          image: card.dataset.image,
          value: card.dataset.value,
          pseudo: currentPseudo,
        })
      );

      // Mettre à jour l'état de la carte
      card.src = card.dataset.image;
      card.dataset.visible = "true";
    }
  }
}

function updateFlippedCard(cardId, image, value) {
  // Recherche de l'image de la carte à l'aide de son attribut data-id
  const cardImg = document.querySelector(`img.card[data-id="${cardId}"]`);
  if (cardImg) {
    cardImg.src = image;
    // Mettre à jour l'attribut data-visible pour indiquer que la carte est maintenant visible
    cardImg.dataset.visible = "true";
    cardImg.dataset.value = value;
    // console.log(
    //   `Carte ${cardId} retournée, data-visible réglé à ${cardImg.dataset.visible}`
    // );
  }
}

function updateTurnDisplay(currentPlayer) {
  const turnInfo = document.getElementById("turn-info");
  turnInfo.textContent = `C'est le tour de ${currentPlayer}`;
  turnInfo.style.padding = "10px";
  turnInfo.style.backgroundColor =
    currentPlayer === currentPseudo ? "#27ae60" : "#c0392b";
  turnInfo.style.color = "#fff";
  turnInfo.style.borderRadius = "5px";
  turnInfo.style.textAlign = "center";
  turnInfo.style.marginBottom = "15px";
  console.log("Turn display updated:", currentPlayer);
}

function nextTurn() {
  isPlayerTurn = false;
  isCardDrawn = false;
  drawnCard = null;
  drawnCardDisplay.style.display = "none";
  // Si le dernier tour a été engagé, on ne réinitialise pas le flag lastRoundTriggered
  // afin de permettre au serveur de gérer la fin de partie.
}

// Mettre à jour le style CSS
const style = document.createElement("style");
style.textContent = `
  .drawn-card {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    background: rgba(0, 0, 0, 0.8);
    padding: 10px;
    border-radius: 10px;
    pointer-events: none;  /* Désactive les interactions avec la carte */
  }
  .drawn-card img {
    width: 100px;
    height: auto;
  }
`;
document.head.appendChild(style);

function updateAvailableActions() {
  const deckElement = document.getElementById("deck");
  const discardPileElement = document.getElementById("discard-pile");
  // On sélectionne uniquement la main du joueur local
  const localHandElement = document.querySelector(
    '#players-hands .hand[data-pseudo="' + currentPseudo + '"]'
  );

  console.log("updateAvailableActions:", {
    isPlayerTurn,
    isCardDrawn,
    hasDiscarded,
    drawSource,
  });

  if (!isPlayerTurn) {
    // Ce n'est pas votre tour : tout reste assombri.
    deckElement.classList.add("dim");
    discardPileElement.classList.add("dim");
    if (localHandElement) localHandElement.classList.add("dim");
  } else {
    // C'est votre tour
    if (!isCardDrawn && !hasDiscarded) {
      // Au début du tour, aucune carte n'a été piochée :
      // La pioche et la défausse sont actives, la main est assombrie.
      deckElement.classList.remove("dim");
      discardPileElement.classList.remove("dim");
      if (localHandElement) localHandElement.classList.add("dim");
    } else if (isCardDrawn) {
      // Une carte vient d'être piochée et n'est pas encore défaussée.
      deckElement.classList.add("dim"); // On interdit de repiocher.
      // Si la carte provient du deck, la défausse reste active (pour pouvoir défausser).
      if (drawSource === "deck") {
        discardPileElement.classList.remove("dim");
      } else if (drawSource === "discard") {
        // Si la pioche était depuis la défausse, la zone défausse reste assombrie.
        discardPileElement.classList.add("dim");
      }
      if (localHandElement) localHandElement.classList.remove("dim");
    } else if (!isCardDrawn && hasDiscarded) {
      // La carte piochée depuis le deck a été défaussée.
      // Les zones de pioche deviennent assombries et seule la main est active.
      deckElement.classList.add("dim");
      discardPileElement.classList.add("dim");
      if (localHandElement) localHandElement.classList.remove("dim");
    }
  }
}

// Fonction qui vérifie si la main locale contient uniquement des cartes visibles.
function isLocalHandFullyVisible() {
  const localHandElement = document.querySelector(
    `#players-hands .hand[data-pseudo="${currentPseudo}"]`
  );
  if (!localHandElement) return false;
  const cards = localHandElement.querySelectorAll("img.card");

  // Affichage pour le debug
  cards.forEach((card) => {
    console.log(`Carte ${card.dataset.id} visible: ${card.dataset.visible}`);
  });

  for (let card of cards) {
    // On teste si l'attribut data-visible vaut exactement la chaîne "true"
    if (card.dataset.visible !== "true") {
      return false;
    }
  }
  return true;
}

// Fonction pour afficher le gros popup final annonçant le gagnant et les scores
function showGameOverPopup(winner, playersResults) {
  const popup = document.createElement("div");
  popup.className = "game-over-popup";
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.backgroundColor = "#2c3e50";
  popup.style.color = "#ecf0f1";
  popup.style.padding = "30px";
  popup.style.borderRadius = "10px";
  popup.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.3)";
  popup.style.zIndex = "2000";
  popup.style.textAlign = "center";

  let content = `<h1>Fin de la partie !</h1>`;
  content += `<h2>Le gagnant est ${winner} !</h2>`;
  content += `<h3>Résultats :</h3>`;
  content += `<ul style="list-style: none; padding: 0;">`;
  playersResults.forEach((player) => {
    content += `<li>${player.pseudo} : ${player.score} points</li>`;
  });
  content += `</ul>`;

  // On peut ajouter un bouton pour redémarrer la partie ou pour fermer le popup
  // setTimeout(() => {
  //   popup.style.transition = "opacity 0.5s ease-out";
  //   popup.style.opacity = "0";
  //   setTimeout(() => popup.remove(), 500);
  // }, 10000);

  // Ajout du bouton pour redémarrer la partie
  const restartButton = document.createElement("button");
  restartButton.innerText = "Redémarrer la partie";
  restartButton.style.marginTop = "20px";
  restartButton.style.padding = "10px 20px";
  restartButton.style.backgroundColor = "#e74c3c";
  restartButton.style.color = "#fff";
  restartButton.style.border = "none";
  restartButton.style.borderRadius = "5px";
  restartButton.style.cursor = "pointer";

  // Ajout de l'événement pour redémarrer la partie
  restartButton.onclick = () => {
    // Logique pour redémarrer la partie
    // Vous pouvez appeler une fonction ici pour réinitialiser le jeu
    console.log("Partie redémarrée !");
    popup.remove(); // Ferme le popup après avoir cliqué sur le bouton
    // Appeler une fonction pour réinitialiser le jeu
    // restartGame(); // Assurez-vous d'avoir cette fonction définie
  };

  popup.appendChild(restartButton);
  popup.innerHTML += content; // Ajoutez le contenu après le bouton

  document.body.appendChild(popup);
}

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

const cardPioche = document.createElement("img");
cardPioche.classList.add("card_pioche", "cursor_pointer", "rounded");
deckDiv.appendChild(cardPioche);

const cardDefausse = document.createElement("img");
cardDefausse.classList.add("card_defausse", "cursor_pointer", "rounded");
discardPileDiv.appendChild(cardDefausse);

deckDiv.addEventListener("click", function() {
  if (!isPlayerTurn) {
    appendLog("Ce n'est pas votre tour");
    return;
  }

  if (!isCardDrawn && !drawnCard) {
    appendLog("Pioche depuis le deck");
    drawSource = 'deck';
    ws.send(JSON.stringify({ type: "draw-card" }));
  }
});

discardPileDiv.addEventListener("click", function() {
  if (!isPlayerTurn) {
    appendLog("Ce n'est pas votre tour");
    return;
  }

  if (isCardDrawn || drawnCard) {
    // Si on a déjà une carte en main, on peut la défausser
    if (drawnCard) {
      if (drawSource === 'discard') {
        // Si la carte vient de la défausse, on la repose et on ne peut que piocher
        appendLog("Carte de la défausse reposée - vous devez piocher une nouvelle carte de la pioche");
        ws.send(JSON.stringify({
          type: "discard-drawn-card",
          card: drawnCard,
          pseudo: currentPseudo,
          fromDiscard: true
        }));
      } else {
        // Si la carte vient de la pioche, on peut la défausser et retourner une carte
        appendLog("Défausse de la carte piochée");
        ws.send(JSON.stringify({
          type: "discard-drawn-card",
          card: drawnCard,
          pseudo: currentPseudo,
          fromDiscard: false
        }));
      }
    }
  } else {
    // Sinon, on peut piocher depuis la défausse
    appendLog("Pioche depuis la défausse");
    drawSource = 'discard';
    ws.send(JSON.stringify({
      type: "draw-from-discard",
      pseudo: currentPseudo
    }));
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

function calculatePoints(hand) {
  return hand.reduce((total, card) => {
    // Ajouter les points seulement si la carte est visible et non complétée
    if (card.visible && !card.columnCompleted) {
      return total + parseInt(card.value);
    }
    return total;
  }, 0);
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  appendLog(`Message reçu: ${data.type}`);

  switch (data.type) {
    case "room-created":
      roomInfo.textContent = `Room ID: ${data.roomId}`;
      roomControls.style.display = "none";
      gameControls.style.display = "block";
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
          currentPseudo
        });
      }
      break;

    case "update-hands":
      console.log("Updating hands:", data);
      displayPlayersHands(data.players);
      break;

    case "card-flipped":
      updateFlippedCard(data.cardId, data.image, data.value);
      const playerElement = document.querySelector(
        `[data-pseudo='${data.pseudo}']`
      );
      if (playerElement) {
        playerElement.dataset.chooseCard = data.chooseCard;
      }
      console.log(
        `Player ${data.pseudo} has flipped ${data.chooseCard} cards.`
      );
      // Mettre à jour l'affichage des points après le retournement d'une carte
      displayPlayersHands(data.players);
      appendMessage(`${data.pseudo} a retourné une carte`);
      break;

    case "turn-ended":
      appendMessage(`Player ${data.player} has ended their turn.`);
      break;

    case "next-turn":
      currentTurnPlayer = data.currentPlayer;
      isPlayerTurn = currentPseudo === data.currentPlayer;
      hasDiscarded = false;
      drawSource = null;
      // appendMessage(`Tour suivant: ${data.currentPlayer}`);
      updateTurnDisplay(data.currentPlayer);
      break;

    case "card-drawn":
      drawnCardDisplay.innerHTML = '';
      const cardImg = document.createElement("img");
      cardImg.src = data.card.image;
      cardImg.classList.add("card", "rounded");
      drawnCardDisplay.appendChild(cardImg);
      drawnCardDisplay.style.display = "block";
      
      if (data.player === currentPseudo) {
        drawnCard = data.card;
        isCardDrawn = true;
        drawSource = 'deck';
        appendMessage(`Vous avez pioché un ${data.card.value}`);
      } else {
        appendMessage(`${data.player} a pioché un ${data.card.value}`);
      }
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
      appendMessage(`${data.player} a remplacé une carte.`);
      break;

    case "drawn-card-discarded":
      appendMessage("Carte piochée défaussée");
      displayGameArea(data.deckSize, data.discardPile);
      isCardDrawn = false;
      drawnCard = null;
      hasDiscarded = drawSource === 'deck';
      drawnCardDisplay.style.display = "none";
      break;

    case "card-drawn-from-discard":
      drawnCard = data.card;
      isCardDrawn = true;
      drawnCardDisplay.innerHTML = '';
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
      break;

    case "column-update":
      displayPlayersHands(data.players);
      displayGameArea(null, data.discardPile);
      if (data.completedValue) {
        appendMessage(`Une colonne de ${data.completedValue} a été complétée!`);
      }
      break;

    default:
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
  
  ws.send(JSON.stringify({ 
    type: "draw-from-discard",
    pseudo: currentPseudo
  }));
}

function discardCard(card) {
  ws.send(JSON.stringify({ type: "discard-card", card }));
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
    
    const playerInfoDiv = document.createElement("div");
    playerInfoDiv.className = "player-info";
    
    const playerName = document.createElement("h3");
    playerName.textContent = player.pseudo;
    playerName.dataset.pseudo = player.pseudo;
    
    if (gameLaunched) {
      if (player.pseudo === currentPseudo) {
        // Pour votre pseudo : vert si c'est votre tour, sinon rouge.
        playerName.style.color = isPlayerTurn ? "#c0392b" : "#27ae60";
      } else {
        // Pour les adversaires : s'il s'agit du joueur actif, son pseudo doit être vert,
        // sinon (c'est qu'il attend son tour) il sera affiché en rouge.
        playerName.style.color = isPlayerTurn ? "#27ae60" : (player.pseudo === currentTurnPlayer ? "#c0392b" : "#27ae60");
      }
    } else {
      playerName.style.color = "#666";
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

    // Créer une matrice 4x3 pour faciliter la vérification des colonnes
    const cardGrid = Array(4).fill().map(() => Array(3).fill(null));
    player.hand.forEach((card, index) => {
      const col = Math.floor(index / 3);
      const row = index % 3;
      cardGrid[col][row] = card;
    });

    // Pour chaque colonne
    for (let col = 0; col < 4; col++) {
      const column = document.createElement("div");
      column.className = "deck-column";
      
      // Vérifier si la colonne a 3 cartes identiques et visibles
      const columnCards = cardGrid[col];
      const isColumnComplete = columnCards.every(card => 
        card && 
        card.visible && 
        columnCards[0] && 
        card.value === columnCards[0].value
      );

      // Vérifier si la colonne n'est pas déjà marquée comme complétée
      const isAlreadyCompleted = columnCards.every(card => card && card.columnCompleted);

      for (let row = 0; row < 3; row++) {
        const card = cardGrid[col][row];
        if (card) {
          const cardImg = document.createElement("img");
          cardImg.classList.add("card", "rounded");
          
          // Afficher la bonne face de la carte
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

      if (isColumnComplete && !isAlreadyCompleted && player.pseudo === currentPseudo) {
        ws.send(JSON.stringify({
          type: "column-completed",
          column: col,
          value: columnCards[0].value,
          pseudo: player.pseudo
        }));
        appendLog(`Colonne ${col + 1} complétée avec trois ${columnCards[0].value}!`);
      }

      deckContainer.appendChild(column);
    }

    playerDiv.appendChild(deckContainer);
    playersHandsDiv.appendChild(playerDiv);
  });
}

function flipCard(event) {
  const card = event.target;
  const visible = card.dataset.visible === "true";
  const owner = card.dataset.owner;

  appendLog(`Carte cliquée - Phase: ${gameLaunched ? "jeu" : "initiale"}, Propriétaire: ${owner}`);

  if (owner !== currentPseudo) {
    appendLog("Ce n'est pas votre carte");
    return;
  }

  const playerElement = document.querySelector(`[data-pseudo='${currentPseudo}']`);
  let chooseCard = parseInt(playerElement.dataset.chooseCard || 0);

  if (!gameLaunched) {
    if (chooseCard >= 2 || visible) {
      appendLog("Impossible de retourner plus de cartes en phase initiale");
      return;
    }
    
    ws.send(JSON.stringify({
      type: "flip-card",
      cardId: card.dataset.id,
      image: card.dataset.image,
      value: card.dataset.value,
      pseudo: currentPseudo,
      chooseCard: chooseCard + 1
    }));
  } 
  else {
    if (!isPlayerTurn) {
      appendLog("Ce n'est pas votre tour");
      return;
    }

    if (drawSource === 'deck' && !isCardDrawn && !drawnCard && !hasDiscarded) {
      appendLog("Vous devez d'abord piocher une carte !");
      appendMessage("Vous devez d'abord piocher une carte !");
      return;
    }

    if (drawnCard) {
      appendLog("Remplacement de la carte par celle piochée");
      ws.send(JSON.stringify({
        type: "replace-card",
        oldCardId: card.dataset.id,
        newCard: drawnCard,
        pseudo: currentPseudo
      }));
    } else if (!visible && (hasDiscarded || drawSource === 'deck')) {
      appendLog("Retournement de carte après défausse");
      ws.send(JSON.stringify({
        type: "flip-card",
        cardId: card.dataset.id,
        image: card.dataset.image,
        value: card.dataset.value,
        pseudo: currentPseudo
      }));
    }
  }

  card.src = card.dataset.image;
  card.dataset.visible = "true";
}

function updateFlippedCard(cardId, image, value) {
  const cardImg = document.querySelector(`img[data-id="${cardId}"]`);
  if (cardImg) {
    cardImg.src = image;
    cardImg.dataset.visible = "true";
    cardImg.dataset.value = value;
  }
}

function updateTurnDisplay(currentPlayer) {
  const turnInfo = document.getElementById("turn-info");
  turnInfo.textContent = `C'est le tour de ${currentPlayer}`;
  turnInfo.style.padding = "10px";
  turnInfo.style.backgroundColor = currentPlayer === currentPseudo ? "#27ae60" : "#c0392b";
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
}

// Mettre à jour le style CSS
const style = document.createElement('style');
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


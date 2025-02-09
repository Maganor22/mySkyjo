const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const cards = [
  { image: "/images/-2.png", value: -2, number: 5 },
  { image: "/images/-1.png", value: -1, number: 10 },
  { image: "/images/0.png", value: 0, number: 15 },
  { image: "/images/1.png", value: 1, number: 10 },
  { image: "/images/2.png", value: 2, number: 10 },
  { image: "/images/3.png", value: 3, number: 10 },
  { image: "/images/4.png", value: 4, number: 10 },
  { image: "/images/5.png", value: 5, number: 10 },
  { image: "/images/6.png", value: 6, number: 10 },
  { image: "/images/7.png", value: 7, number: 10 },
  { image: "/images/8.png", value: 8, number: 10 },
  { image: "/images/9.png", value: 9, number: 10 },
  { image: "/images/10.png", value: 10, number: 10 },
  { image: "/images/11.png", value: 11, number: 10 },
  { image: "/images/12.png", value: 12, number: 10 },
];

class Player {
  constructor(ws, pseudo) {
    this.ws = ws;
    this.pseudo = pseudo;
    this.hand = [];
    this.chooseCard = 0;
    this.flippedCards = []; // Ajouter cette ligne
    this.hasDrawnAndDiscarded = false;
    this.hasDrawn = false;
  }

  dealHand(deck, numCards) {
    for (let i = 0; i < numCards; i++) {
      const card = deck.pop();
      if (card) {
        this.hand.push({ ...card, visible: false, id: `${this.pseudo}-${i}` });
        const index = deck.findIndex(
          (c) => c.image === card.image && c.value === card.value
        );
        if (index !== -1) {
          deck[index].number--;
          if (deck[index].number === 0) {
            deck.splice(index, 1);
          }
        }
      }
    }
  }
}

let rooms = {};

function generateRoomId() {
  return Math.random().toString(36).substr(2, 9);
}

function areAllCardsFlipped(player) {
  return player.hand.every((card) => card.visible);
}

function initializeDeck() {
  let deck = [];
  cards.forEach((card) => {
    for (let i = 0; i < card.number; i++) {
      deck.push({ image: card.image, value: card.value, number: card.number });
    }
  });
  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Fonction pour passer au joueur suivant
function nextTurn(roomId) {
  const room = rooms[roomId];
  if (room) {
    room.currentTurn = (room.currentTurn + 1) % room.players.length;
    room.players.forEach((player) => {
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(
          JSON.stringify({
            type: "next-turn",
            currentTurn: room.currentTurn,
            currentPlayer: room.players[room.currentTurn].pseudo,
            players: room.players.map((pl) => ({
              pseudo: pl.pseudo,
              hand: pl.hand,
            })),
          })
        );
      }
    });
    // Réinitialiser les flags pour le nouveau joueur
    room.players.forEach((p) => {
      p.hasDrawn = false;
      p.hasDrawnAndDiscarded = false;
    });
  }
}

function calculateFlippedCardValue(player) {
  return player.hand
    .filter((card) => card.visible)
    .slice(0, 2)
    .reduce((total, card) => total + card.value, 0);
}

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "create-room":
        const roomId = generateRoomId();
        const hostPlayer = new Player(ws, data.pseudo);
        rooms[roomId] = {
          host: hostPlayer,
          players: [hostPlayer],
          deck: initializeDeck(),
          discardPile: [], // Initialize an empty discard pile
          currentTurn: 0,
          gameStarted: false,
        };
        ws.roomId = roomId;
        ws.pseudo = data.pseudo;
        ws.send(JSON.stringify({ type: "room-created", roomId }));
        console.log(`Room ${roomId} created with host ${data.pseudo}`);
        break;

      case "join-room":
        const joinRoomId = data.roomId;
        if (rooms[joinRoomId] && rooms[joinRoomId].players.length < 4) {
          const newPlayer = new Player(ws, data.pseudo);
          rooms[joinRoomId].players.push(newPlayer);
          ws.roomId = joinRoomId;
          ws.pseudo = data.pseudo;
          ws.send(JSON.stringify({ type: "room-joined", roomId: joinRoomId }));
          rooms[joinRoomId].players.forEach((player) => {
            if (player.ws.readyState === WebSocket.OPEN) {
              player.ws.send(
                JSON.stringify({
                  type: "player-joined",
                  players: rooms[joinRoomId].players.map((p) => p.pseudo),
                })
              );
            }
          });
          console.log(`${data.pseudo} joined room ${joinRoomId}`);
        } else {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Room is full or does not exist.",
            })
          );
        }
        break;

      case "start-game":
        const startRoomId = ws.roomId;
        if (
          rooms[startRoomId] &&
          rooms[startRoomId].host.ws === ws &&
          rooms[startRoomId].players.length >= 2
        ) {
          let deck = rooms[startRoomId].deck;

          rooms[startRoomId].players.forEach((player) => {
            player.dealHand(deck, 12);
          });

          console.log(`Starting game in room ${startRoomId}`);
          console.log("Remaining deck after dealing:");
          console.log(deck);

          const discardCard = deck.pop();
          rooms[startRoomId].discardPile.push(discardCard);

          rooms[startRoomId].players.forEach((player) => {
            if (player.ws.readyState === WebSocket.OPEN) {
              player.ws.send(
                JSON.stringify({
                  type: "game-started",
                  players: rooms[startRoomId].players.map((p) => ({
                    id: p.id,
                    pseudo: p.pseudo,
                    hand: p.hand.map((card) => ({
                      image: card.image,
                      value: card.value,
                      visible: card.visible,
                      id: card.id, // Ensure the id is included here
                    })),
                  })),
                  deckSize: rooms[startRoomId].deck.length,
                  discardPile: rooms[startRoomId].discardPile, // Send the discard pile
                })
              );
            }
          });

          rooms[startRoomId].deck = deck;
        }
        break;

      case "launch-game":
        console.log("Game launched !");
        break;

      // Ajouter une propriété pour suivre les flips de cartes

      case "flip-card":
        const flipRoomId = ws.roomId;
        if (flipRoomId && rooms[flipRoomId]) {
          const player = rooms[flipRoomId].players.find(
            (p) => p.pseudo === data.pseudo
          );
          if (player) {
            const cardIndex = player.hand.findIndex(
              (card) => card.id === data.cardId
            );
            if (cardIndex !== -1) {
              player.hand[cardIndex].visible = true;

              // Log pour vérifier l'état des cartes après le retournement
              // console.log(
              //   `Player ${data.pseudo} flipped a card. Current hand state:`
              // );
              // player.hand.forEach((card, index) => {
              //   console.log(`Card ${index + 1}: visible = ${card.visible}`);
              // });

              // Informer tous les joueurs du retournement
              rooms[flipRoomId].players.forEach((p) => {
                if (p.ws.readyState === WebSocket.OPEN) {
                  p.ws.send(
                    JSON.stringify({
                      type: "card-flipped",
                      cardId: data.cardId,
                      image: data.image,
                      value: data.value,
                      pseudo: data.pseudo, // Assurez-vous que le pseudo est correctement envoyé
                      players: rooms[flipRoomId].players.map((pl) => ({
                        pseudo: pl.pseudo,
                        hand: pl.hand,
                      })),
                    })
                  );
                }
              });

              // Vérifier si c'est la phase initiale
              if (!rooms[flipRoomId].gameStarted) {
                player.chooseCard = (player.chooseCard || 0) + 1;

                // Vérifier si tous les joueurs ont retourné leurs 2 cartes
                const allPlayersReady = rooms[flipRoomId].players.every(
                  (p) => p.chooseCard >= 2
                );

                if (allPlayersReady) {
                  rooms[flipRoomId].gameStarted = true;
                  rooms[flipRoomId].currentTurn = 0;
                  const firstPlayer = rooms[flipRoomId].players[0];

                  rooms[flipRoomId].players.forEach((p) => {
                    if (p.ws.readyState === WebSocket.OPEN) {
                      p.ws.send(
                        JSON.stringify({
                          type: "game-launched",
                          currentPlayer: firstPlayer.pseudo,
                          currentTurn: 0,
                          players: rooms[flipRoomId].players.map((pl) => ({
                            pseudo: pl.pseudo,
                            hand: pl.hand,
                          })),
                          deckSize: rooms[flipRoomId].deck.length,
                          discardPile: rooms[flipRoomId].discardPile,
                        })
                      );
                    }
                  });
                }
              } else {
                // Phase de jeu : vérifier si toutes les cartes du joueur sont visibles
                const allCardsFlipped = areAllCardsFlipped(player);
                // console.log(
                //   `All cards flipped for ${data.pseudo}: ${allCardsFlipped}`
                // );

                if (allCardsFlipped && !rooms[flipRoomId].lastRoundTriggered) {
                  // console.log(`Sending last-round-trigger for ${data.pseudo}`);
                  rooms[flipRoomId].lastRoundTriggered = true;
                  rooms[flipRoomId].players.forEach((p) => {
                    if (p.ws.readyState === WebSocket.OPEN) {
                      p.ws.send(
                        JSON.stringify({
                          type: "last-round-trigger",
                          message: `${data.pseudo} a retourné toutes ses cartes, c'est le dernier tour !`,
                        })
                      );
                    }
                  });
                }

                // Si le dernier tour a été déclenché, retourner automatiquement les cartes restantes
                if (rooms[flipRoomId].lastRoundTriggered) {
                  player.hand.forEach((card) => {
                    if (!card.visible) {
                      card.visible = true;
                    }
                  });

                  // Vérifier si tous les joueurs ont fini de jouer
                  const allPlayersFinished = rooms[flipRoomId].players.every(
                    (p) => p.hand.every((card) => card.visible)
                  );

                  if (allPlayersFinished) {
                    // Calculer le gagnant
                    let winner = null;
                    let lowestScore = Infinity;
                    rooms[flipRoomId].players.forEach((p) => {
                      const score = p.hand.reduce((total, card) => {
                        return total + (card.value || 0);
                      }, 0);

                      // console.log(`Score for ${p.pseudo}: ${score}`); // Log pour déboguer

                      // Trouver le joueur avec le score le plus bas
                      if (score < lowestScore) {
                        lowestScore = score;
                        winner = p.pseudo;
                      }
                    });

                    // Annoncer le gagnant
                    rooms[flipRoomId].players.forEach((p) => {
                      if (p.ws.readyState === WebSocket.OPEN) {
                        const results = rooms[flipRoomId].players.map((pl) => {
                          const hand = pl.hand || []; // Assurez-vous que la main est un tableau
                          const score = hand.reduce((total, card) => {
                            return total + (card.value || 0);
                          }, 0);

                          return {
                            pseudo: pl.pseudo,
                            score: score,
                            hand: hand.map((card) => ({
                              image: card.image,
                              value: card.value,
                              visible: card.visible,
                              id: card.id,
                            })), // Ajout des informations sur la main
                          };
                        });

                        p.ws.send(
                          JSON.stringify({
                            type: "game-over",
                            message: `Le gagnant est ${winner} avec un score de ${lowestScore} !`,
                            winner: winner,
                            results: results,
                          })
                        );
                      }
                    });
                  }
                }

                // Passer au joueur suivant après le retournement de la carte
                nextTurn(flipRoomId);
              }
            }
          }
        }
        break;

      case "draw-card":
        const drawRoomId = ws.roomId;
        if (drawRoomId && rooms[drawRoomId]) {
          const player = rooms[drawRoomId].players.find((p) => p.ws === ws);
          if (player) {
            // Vérifier si c'est bel et bien le tour du joueur
            if (
              rooms[drawRoomId].players[rooms[drawRoomId].currentTurn].ws !== ws
            ) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Ce n'est pas votre tour",
                })
              );
              break;
            }

            // Empêcher de piocher si un joueur a déjà pioché une carte (et potentiellement l'a défaussée)
            if (player.hasDrawn) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message:
                    "Vous avez déjà pioché une carte et devez retourner une carte de votre jeu",
                })
              );
              break;
            }

            // Indiquer que le joueur a pioché
            player.hasDrawn = true;
            player.hasDrawnAndDiscarded = false;

            const drawnCard = rooms[drawRoomId].deck.pop();
            // console.log("Card drawn:", drawnCard);

            rooms[drawRoomId].players.forEach((p) => {
              if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(
                  JSON.stringify({
                    type: "card-drawn",
                    player: player.pseudo,
                    card: drawnCard,
                    deckSize: rooms[drawRoomId].deck.length,
                    discardPile: rooms[drawRoomId].discardPile,
                  })
                );
              }
            });
          }
        }
        break;

      case "replace-card":
        const actionRoomId = ws.roomId;
        if (actionRoomId && rooms[actionRoomId]) {
          const player = rooms[actionRoomId].players.find(
            (p) => p.pseudo === data.pseudo
          );
          if (player) {
            let cardIndex;
            if (data.type === "flip-card") {
              cardIndex = player.hand.findIndex(
                (card) => card.id === data.cardId
              );
              if (cardIndex !== -1) {
                player.hand[cardIndex].visible = true;
              }
            } else if (data.type === "replace-card") {
              cardIndex = player.hand.findIndex(
                (card) => card.id === data.oldCardId
              );
              if (cardIndex !== -1) {
                const oldCard = player.hand[cardIndex];
                rooms[actionRoomId].discardPile.push(oldCard);
                player.hand[cardIndex] = {
                  ...data.newCard,
                  id: data.oldCardId,
                  visible: true,
                };
              }
            }

            // Log pour vérifier l'état des cartes après l'action
            // console.log(
            //   `Player ${data.pseudo} performed an action. Current hand state:`
            // );
            // player.hand.forEach((card, index) => {
            //   console.log(`Card ${index + 1}: visible = ${card.visible}`);
            // });

            // Informer tous les joueurs de l'action
            rooms[actionRoomId].players.forEach((p) => {
              if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(
                  JSON.stringify({
                    type:
                      data.type === "flip-card"
                        ? "card-flipped"
                        : "card-replaced",
                    cardId: data.cardId,
                    image: data.image,
                    value: data.value,
                    pseudo: data.pseudo,
                    players: rooms[actionRoomId].players.map((pl) => ({
                      pseudo: pl.pseudo,
                      hand: pl.hand,
                    })),
                    deckSize: rooms[actionRoomId].deck.length,
                    discardPile: rooms[actionRoomId].discardPile,
                  })
                );
              }
            });

            // Vérifier si toutes les cartes du joueur sont visibles
            const allCardsFlipped = areAllCardsFlipped(player);
            // console.log(
            //   `All cards flipped for ${data.pseudo}: ${allCardsFlipped}`
            // );

            if (allCardsFlipped && !rooms[actionRoomId].lastRoundTriggered) {
              // console.log(`Sending last-round-trigger for ${data.pseudo}`);
              rooms[actionRoomId].lastRoundTriggered = true;
              rooms[actionRoomId].players.forEach((p) => {
                if (p.ws.readyState === WebSocket.OPEN) {
                  p.ws.send(
                    JSON.stringify({
                      type: "last-round-trigger",
                      message: `${data.pseudo} a retourné toutes ses cartes, c'est le dernier tour !`,
                    })
                  );
                }
              });
            }

            // Si le dernier tour a été déclenché, retourner automatiquement les cartes restantes
            if (rooms[actionRoomId].lastRoundTriggered) {
              player.hand.forEach((card) => {
                if (!card.visible) {
                  card.visible = true;
                }
              });

              // Vérifier si tous les joueurs ont fini de jouer
              const allPlayersFinished = rooms[actionRoomId].players.every(
                (p) => p.hand.every((card) => card.visible)
              );

              if (allPlayersFinished) {
                // Calculer le gagnant
                let winner = null;
                let lowestScore = Infinity;
                rooms[actionRoomId].players.forEach((p) => {
                  const score = p.hand.reduce((total, card) => {
                    return total + (card.value || 0);
                  }, 0);

                  // console.log(`Score for ${p.pseudo}: ${score}`); // Log pour déboguer

                  // Trouver le joueur avec le score le plus bas
                  if (score < lowestScore) {
                    lowestScore = score;
                    winner = p.pseudo;
                  }
                });

                // Annoncer le gagnant
                rooms[actionRoomId].players.forEach((p) => {
                  if (p.ws.readyState === WebSocket.OPEN) {
                    const results = rooms[actionRoomId].players.map((pl) => {
                      const hand = pl.hand || []; // Assurez-vous que la main est un tableau
                      const score = hand.reduce((total, card) => {
                        return total + (card.value || 0);
                      }, 0);

                      return {
                        pseudo: pl.pseudo,
                        score: score,
                        hand: hand.map((card) => ({
                          image: card.image,
                          value: card.value,
                          visible: card.visible,
                          id: card.id,
                        })), // Ajout des informations sur la main
                      };
                    });

                    p.ws.send(
                      JSON.stringify({
                        type: "game-over",
                        message: `Le gagnant est ${winner} avec un score de ${lowestScore} !`,
                        winner: winner,
                        results: results,
                      })
                    );
                  }
                });
              }
            }

            // Passer au joueur suivant après l'action
            nextTurn(actionRoomId);
          }
        }
        break;

      case "discard-drawn-card":
        const discardRoomId = ws.roomId;
        if (discardRoomId && rooms[discardRoomId]) {
          const player = rooms[discardRoomId].players.find(
            (p) => p.pseudo === data.pseudo
          );
          if (player) {
            // Ajouter la carte à la défausse
            rooms[discardRoomId].discardPile.push(data.card);

            // Si la carte venait de la défausse, ne pas marquer comme ayant défaussé
            player.hasDrawnAndDiscarded = !data.fromDiscard;

            // Informer tous les joueurs
            rooms[discardRoomId].players.forEach((p) => {
              if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(
                  JSON.stringify({
                    type: "drawn-card-discarded",
                    deckSize: rooms[discardRoomId].deck.length,
                    discardPile: rooms[discardRoomId].discardPile,
                    fromDiscard: data.fromDiscard,
                  })
                );
              }
            });

            // Ne jamais passer au tour suivant ici
            // Le tour suivant sera déclenché après le flip-card
          }
        }
        break;

      case "game-started":
        gameStarted = true;
        break;

      case "game-launched":
        console.log("Game launched !");
        gameLaunched = true;
        break;

      case "message":
        const messageRoomId = ws.roomId;
        if (messageRoomId && rooms[messageRoomId]) {
          rooms[messageRoomId].players.forEach((player) => {
            if (player.ws.readyState === WebSocket.OPEN) {
              player.ws.send(
                JSON.stringify({
                  type: "message",
                  message: `${ws.pseudo}: ${data.message}`,
                })
              );
            }
          });
        }
        break;

      case "draw-from-discard":
        const drawDiscardRoomId = ws.roomId;
        if (drawDiscardRoomId && rooms[drawDiscardRoomId]) {
          const player = rooms[drawDiscardRoomId].players.find(
            (p) => p.pseudo === data.pseudo
          );
          if (player && rooms[drawDiscardRoomId].discardPile.length > 0) {
            // Vérifier si c'est le tour du joueur
            if (
              rooms[drawDiscardRoomId].players[
                rooms[drawDiscardRoomId].currentTurn
              ].pseudo !== data.pseudo
            ) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Ce n'est pas votre tour",
                })
              );
              break;
            }

            // Marquer que le joueur a pioché
            player.hasDrawn = true;
            player.hasDrawnAndDiscarded = false;

            // Prendre la dernière carte de la défausse
            const drawnCard = rooms[drawDiscardRoomId].discardPile.pop();

            // Informer tous les joueurs
            rooms[drawDiscardRoomId].players.forEach((p) => {
              if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(
                  JSON.stringify({
                    type: "card-drawn-from-discard",
                    player: player.pseudo,
                    card: drawnCard,
                    deckSize: rooms[drawDiscardRoomId].deck.length,
                    discardPile: rooms[drawDiscardRoomId].discardPile,
                  })
                );
              }
            });
          }
        }
        break;

      case "column-completed":
        const columnRoomId = ws.roomId;
        if (columnRoomId && rooms[columnRoomId]) {
          const player = rooms[columnRoomId].players.find(
            (p) => p.pseudo === data.pseudo
          );
          if (player) {
            // Marquer les cartes de la colonne comme complétées
            const columnCards = player.hand.filter(
              (card, index) => Math.floor(index / 3) === parseInt(data.column)
            );

            // Vérifier si la colonne n'a pas déjà été complétée
            if (!columnCards[0].columnCompleted) {
              columnCards.forEach((card) => {
                card.columnCompleted = true;
              });

              // Ajouter une carte de la même valeur à la défausse
              rooms[columnRoomId].discardPile.push({
                value: columnCards[0].value,
                image: columnCards[0].image,
                id: `completed-${Date.now()}`, // Ajouter un ID unique
              });

              console.log(
                `Colonne complétée avec la valeur ${columnCards[0].value}`
              );

              // Informer tous les joueurs
              rooms[columnRoomId].players.forEach((p) => {
                if (p.ws.readyState === WebSocket.OPEN) {
                  p.ws.send(
                    JSON.stringify({
                      type: "column-update",
                      players: rooms[columnRoomId].players.map((pl) => ({
                        pseudo: pl.pseudo,
                        hand: pl.hand,
                      })),
                      discardPile: rooms[columnRoomId].discardPile,
                      completedValue: columnCards[0].value,
                    })
                  );
                }
              });
            }
          }
        }
        break;

      case "last-round-trigger":
        const lastRoundRoomId = ws.roomId;
        if (lastRoundRoomId && rooms[lastRoundRoomId]) {
          // Informer tous les joueurs que c'est le dernier tour
          rooms[lastRoundRoomId].players.forEach((player) => {
            if (player.ws.readyState === WebSocket.OPEN) {
              const message = {
                type: "last-round",
                message: `${data.pseudo} a retourné toutes ses cartes, c'est le dernier tour !`,
              };
              // S'assurer que le message est une chaîne JSON valide
              player.ws.send(JSON.stringify(message));
            }
          });
        }
        break;

      case "turn-ended":
        const turnEndedRoomId = ws.roomId;
        if (turnEndedRoomId && rooms[turnEndedRoomId]) {
          const player = rooms[turnEndedRoomId].players.find(
            (p) => p.ws === ws
          );
          if (player) {
            // Passer au joueur suivant
            nextTurn(turnEndedRoomId);

            // Informer tous les joueurs que le tour a été terminé
            rooms[turnEndedRoomId].players.forEach((p) => {
              if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(
                  JSON.stringify({
                    type: "turn-ended",
                    player: player.pseudo,
                    players: rooms[turnEndedRoomId].players.map((pl) => ({
                      pseudo: pl.pseudo,
                      hand: pl.hand,
                    })),
                  })
                );
              }
            });
          }
        }
        break;

      default:
        const defaultRoomId = ws.roomId;
        if (defaultRoomId && rooms[defaultRoomId]) {
          rooms[defaultRoomId].players.forEach((player) => {
            if (player.ws !== ws && player.ws.readyState === WebSocket.OPEN) {
              player.ws.send(message);
            }
          });
        }
        break;
    }
  });

  ws.on("close", () => {
    const closeRoomId = ws.roomId;
    if (closeRoomId && rooms[closeRoomId]) {
      rooms[closeRoomId].players = rooms[closeRoomId].players.filter(
        (player) => player.ws !== ws
      );
      if (rooms[closeRoomId].players.length === 0) {
        delete rooms[closeRoomId];
      } else {
        rooms[closeRoomId].players.forEach((player) => {
          if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(
              JSON.stringify({
                type: "player-left",
                players: rooms[closeRoomId].players.map((p) => p.pseudo),
              })
            );
          }
        });
      }
    }
  });
});

server.listen(8080, () => {
  console.log("Server started on port 8080");
});

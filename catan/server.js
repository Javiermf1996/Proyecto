"use strict";

let EventEmitter = require("events").EventEmitter,
	Express = require("express"),
	WebSocket = require("ws"),
	catan = require("./catan"), Catan = catan.Catan, repeat = catan.repeat, shuffle = catan.shuffle,
	Player = require("./player"),
	Roads = require("./roads");

let app = Express();
app.use(Express.static("public"));
app.listen(8080);

let wss = new WebSocket.Server({ port: 8081 });

let lobby = [];
wss.on("connection", function (ws) {
	
	console.log("Se ha unido un jugador");

	ws.on("close", function (code, message) {
		console.log("abandono");
		lobby.splice(lobby.indexOf(ws), 1);
	});

	lobby.push(ws);
	if (lobby.length < 4) {
		return;
	}

	
	console.log("Inicia el juego");

	let clients = lobby;
	let players = clients.map((ws) => new Player());
	lobby = [];

	let board = new Catan();
	let turn = 0;
	let currentState;

	let close = new EventEmitter();
	close.once("close", function (skip) {
		clients.forEach(function (ws, player) {
			if (player == skip) { return; }

			ws.send(JSON.stringify({
				message: "chat", sender: -1, text: "Jugador " + skip + " se fue"
			}));
			ws.send(JSON.stringify({ message: "end" }));
			ws.close();
		});
	});

	clients.forEach(function (ws, player) {
		ws.removeAllListeners("close");

		ws.on("message", function (messageJson) {
			console.log("recibido desde Jugador %d: %s", player, messageJson);

			let message = JSON.parse(messageJson);
			if (message.message == "chat") {
				let sendingPlayer = player;
				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({
						message: "chat", sender: sendingPlayer,
						text: message.text.substring(0, 1000)
					}));
				});
				return;
			}

			currentState.onmessage(ws, player, message);
		});

		ws.on("close", function (code, message) {
			console.log("jugador %d ha salido", player);
			close.emit("close", player);
		});
	});

	class Start {
		constructor() {
			this.towns = [];
			this.building = 0;
			this.phase = 0;

			turn = this.start = [
				rollDie() + rollDie(),
				rollDie() + rollDie(),
				rollDie() + rollDie(),
				rollDie() + rollDie(),
			].reduce((max, d, i, v) => d > v[max] ? i : max, 0);

			clients.forEach(function (ws, player) {
				ws.send(JSON.stringify({ message: "start", board: board, player: player }));
				ws.send(JSON.stringify({ message: "turn", player: turn }));
				ws.send(JSON.stringify({
					message: "chat", sender: -1,
					text: " "
				}));
				sendTurn(ws, player);
			});
		}

		onmessage(ws, player, message) {
			if (player != turn) {
				sendError(ws, "turn");
				return;
			}

			switch (message.message) {
			default: sendError(ws, "message"); break;

			case "build":
				
				if (
					message.type != [Catan.TOWN, Catan.ROAD][this.building] ||
					!board.build(
						message.type, message.x, message.y, message.d, turn,
						true, this.towns[turn]
					)
				) {
					sendError(ws, "build");
					break;
				}

				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({
						message: "build", type: message.type,
						x: message.x, y: message.y, d: message.d,
						player: turn
					}));
				});

				
				if (this.building == 0) {
					this.towns[turn] = { x: message.x, y: message.y, d: message.d };
				}
				this.building = (this.building + 1) % 2;
				if (this.building == 1) { break; }

				let nextTurn;
				if (this.phase == 0) {
					
					nextTurn = (turn + 1) % clients.length;
					if (nextTurn == this.start) {
						this.phase += 1;
						break;
					}
				} else if (this.phase == 1) {
					
					nextTurn = (turn + clients.length - 1) % clients.length;
					if (turn == this.start) {
						turn = nextTurn;
						currentState = new Play();
						currentState.onmessage(ws, turn, { message: "turn" }, true);
						break;
					}
				}
				turn = nextTurn;

				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({ message: "turn", player: turn }));
					sendTurn(ws, player);
				});
				break;
			}
		}
	}

	class Play {
		constructor() {
			
			board.forEachTile(3, 3, 2, (x, y) => {
				for (let [vx, vy, vd] of board.cornerVertices(x, y)) {
					let building = board.buildings[vy][vx][vd];
					if (!building) { continue; }

					let tile = board.tiles[y][x];
					players[building.player].resources[tile] += 1;
				}
			});

			this.development = Array.prototype.concat(
				repeat(Catan.KNIGHT, 14),
				repeat(Catan.VICTORY_POINT, 5),
				repeat(Catan.ROAD_BUILDING, 2),
				repeat(Catan.MONOPOLY, 2),
				repeat(Catan.YEAR_OF_PLENTY, 2)
			);
			shuffle(this.development);

			this.pendingCards = [];
			this.devCardPlayed = false;

			this.freeRoads = 0;

			this.longestRoad = 4;
			this.longestRoadOwner = -1;

			this.largestArmy = 2;
			this.largestArmyOwner = -1;

			clients.forEach(function (ws, player) {
				sendResources(ws, players[player]);
			});
		}

		onmessage(ws, player, message, start) {
			if (player != turn) {
				sendError(ws, "turn");
				return;
			}

			switch (message.message) {
			default: sendError(ws, "message"); break;

			case "offer":
				let tradeState = new Trade(this);
				if (tradeState.onmessage(ws, player, message)) {
					currentState = tradeState;
				}
				break;

			case "build":
				if (
					!(
						players[turn].canAfford(message.type) ||
						(message.type == Catan.ROAD && this.freeRoads > 0)
					) ||
					!board.build(message.type, message.x, message.y, message.d, turn)
				) {
					sendError(ws, "build");
					break;
				}

				if (message.type == Catan.ROAD && this.freeRoads > 0) {
					this.freeRoads--;
				} else {
					players[turn].build(message.type);
				}

				if (+message.type == Catan.ROAD) {
					let dfs_max = Roads.dfs(board, { x: message.x, y: message.y, d: message.d }, turn);
					board.maxRoadLength = dfs_max[0];
					board.maxRoadPlayer = dfs_max[1];
					console.log("max carreteras totales: " + dfs_max[0]);
					console.log("max carreteras jugador: " + dfs_max[1]);
				}

				if(+message.type == Catan.TOWN) {
					let edges = board.protrudeEdges(message.x, message.y, message.d);
					let opponent_roads = 0;
					edges.forEach(([ex, ey, ed]) => {
						if(board.roads[ey][ex][ed] != turn && board.roads[ey][ex][ed] != null){
							opponent_roads++;
						}
					});
					if(opponent_roads > 1){
						let updated_road = Roads.dfs_split(board);
						board.maxRoadLength = updated_road[0];
						board.maxRoadPlayer = updated_road[1];
						console.log("max carreteras totales:" + board.maxRoadLength);
						console.log("max carreteras jugador: " + board.maxRoadPlayer);

					}
				}

				sendResources(clients[turn], players[turn]);
				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({
						message: "build", type: message.type,
						x: message.x, y: message.y, d: message.d,
						player: turn
					}));
				});
				
				if (this.checkForVictory(player)) {
					this.transitionToVictory(player);
				}
				break;

			case "buyDevelop":
				if (!players[player].canAfford(Catan.CARD) || this.development.length == 0) {
					sendError(ws, "buyDevelop");
					break;
				}

				this.pendingCards.push(this.development.pop());
				players[player].build(Catan.CARD);

				sendResources(clients[turn], players[turn]);
				ws.send(JSON.stringify({
					message: "chat", sender: -1,
					text: "tu recibiras la carta de desarrollo alfinal del turno",
				}));
				
				if (this.checkForVictory(player)) {
					this.transitionToVictory(player);
				}
				break;

			case "develop":
				if (players[player].cards[message.card] < 1 || this.devCardPlayed) {
					sendError(ws, "develop");
					return;
				}

				switch (message.card) {
				default: sendError(ws, "develop"); break;

				case Catan.KNIGHT:
					this.devCardPlayed = true;
					currentState = new Robber(this, repeat(0,4));
					players[player].knights++;
					
					if (players[player].knights > board.maxSoldiers) {
						board.maxSoldiers = players[player].knights;
						board.maxSoldiersPlayer = player;
					}
					
					break;

				case Catan.YEAR_OF_PLENTY:
					if (
						message.resources.length != 2 ||
						!message.resources.every(resource => 1 <= resource && resource <= 5)
					) {
						sendError(ws, "yop");
						break;
					}

					this.devCardPlayed = true;
					for (let terrain of message.resources) {
						players[player].resources[terrain] += 1;
					}

					sendResources(ws, players[player]);
					break;

				case Catan.MONOPOLY:
					this.devCardPlayed = true;
					for (let i = 0; i < 4; i++) {
						if (i == player) { continue; }

						let resourceCount = players[i].resources[message.terrain];
						players[i].resources[message.terrain] -= resourceCount;
						players[player].resources[message.terrain] += resourceCount;
					}

					clients.forEach(function (ws, player) {
						sendResources(ws, players[player]);
						ws.send(JSON.stringify({
							message: "chat", sender: -1,
							text: "Jugador " + turn + " robo todos tus " +
								Catan.resourceNames[message.terrain],
						}));
					});
					break;

				

				case Catan.ROAD_BUILDING:
					this.devCardPlayed = true;
					this.freeRoads = 2;

					ws.send(JSON.stringify({
						message: "chat", sender: -1,
						text: "Debes crear 2 carreteras",
					}));
					break;
				}

				if (this.devCardPlayed) {
					console.log("before " + players[turn].cards[message.card]);
					players[turn].cards[message.card] -= 1;
					console.log("after " + players[turn].cards[message.card]);
					sendResources(clients[turn], players[turn]);
				}
				
				if (this.checkForVictory(player)) {
					this.transitionToVictory(player);
				}
				break;

			case "turn":
				turn = (turn + 1) % clients.length;
				this.freeRoads = 0;

				let die1 = rollDie();
				let die2 = rollDie();
				let dice = die1 + die2;
				for (let [tx, ty] of board.hit[dice]) {
					let terrain = board.tiles[ty][tx];
					for (let [vx, vy, vd] of board.cornerVertices(tx, ty)) {
						
						let [rx, ry] = board.robber;
						if (rx == vx && ry == vy) { continue; }

						let building = board.buildings[vy][vx][vd];
						if (!building) { continue; }

						let amount;
						if (building.type == Catan.TOWN) {
							amount = 1;
						} else if (building.type == Catan.CITY) {
							amount = 2;
						}
						players[building.player].resources[terrain] += amount;
					}
				}

				for (let card of this.pendingCards) {
					players[player].cards[card] += 1;
				}
				this.pendingCards = [];
				this.devCardPlayed = false;

				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({
						message: "turn", player: turn, dice: dice, start: start, 
						die1: die1, die2: die2
					}));

					sendTurn(ws, player);
					ws.send(JSON.stringify({
						message: "chat", sender: -1, text: "Tira " + dice,
					}));

					sendResources(ws, players[player]);
				});

				if (dice == 7) {
					
					let resourcesToDiscard = [];
					for (let player in players) {
						let resourceCount = Player.countResources(players[player].resources);
						if (resourceCount > 7) {
							resourcesToDiscard[player] = Math.floor(resourceCount / 2);
						}
					}

					currentState = new Robber(this, resourcesToDiscard);
				}
				break;
			}
		}
		
		checkForVictory(playerID) {
			let player = players[playerID];
			
			let totalPoints = player.cards[Catan.VICTORY_POINT];
			
			if (playerID == turn) {				
				for(let card of this.pendingCards) {
					if (card == Catan.VICTORY_POINT) {
						totalPoints += 1;
					}
				}
			}
			
			board.forEachTile(3, 3, 3, (x, y) => {
				for (let d = 0; d < 2; d++) {
					let building = board.buildings[y][x][d];
					if (!building) { continue; }
					else if (building.player == playerID) {
						if (building.type == Catan.TOWN) {
							totalPoints += 1;
						} else if (building.type == Catan.CITY) {
							totalPoints += 2;
						}
					}
					
				}
			});
			
			if (board.maxRoadPlayer == playerID) {
				totalPoints += 2;
			}
			
			if (board.maxSoldiersPlayer == playerID) {
				totalPoints += 2;
			}
			clients.forEach(function (ws, player) {
				ws.send(JSON.stringify({
					message: "stats",
					longestRoad: board.maxRoad,
					longestRoadPlayer: board.maxRoadPlayer,
					largestArmy: board.maxSoldiers,
					largestArmyPlayer: board.maxSoldiersPlayer
				}));
			});
			return totalPoints >= 10;
		}
		
		transitionToVictory(winningPlayer) {
			clients.forEach(function (ws, player) {
				ws.send(JSON.stringify({
					message: "chat",
					text: "Jugador " + winningPlayer + " ha ganado el juego!",
					sender: -1
				}));
			});
			currentState = new Victory();
		}

	}

	class Trade {
		constructor(play) {
			this.play = play;
			this.offers = [];
		}

		onmessage(ws, player, message) {
			if (player != turn && message.message != "offer") {
				sendError(ws, "turno");
				return false;
			}

			switch (message.message) {
			default: sendError(ws, "message"); break;

			case "offer":
				if (
					Player.countResources(message.offer) == 0 ||
					!players[player].hasResources(message.offer)
				) {
					sendError(ws, "offer");
					return false;
				}

				this.offers[player] = message.offer;
				let offeringPlayer = player;
				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({
						message: "offer", offer: message.offer, player: offeringPlayer
					}));
				});
				break;

			case "confirm":
				for (let resourceType in this.offers[player]) {
					players[turn].resources[resourceType] += (
						this.offers[message.player][resourceType] - this.offers[turn][resourceType]
					);
					players[message.player].resources[resourceType] += (
						this.offers[turn][resourceType] - this.offers[message.player][resourceType]
					);
				}

				sendResources(clients[turn], players[turn]);
				sendResources(clients[message.player], players[message.player]);
				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({ message: "confirm" }));
				});

				currentState = this.play;
				break;

			case "cancel":
				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({ message: "confirm" }));
				});

				currentState = this.play;
				break;
			}

			return true;
		}
	}

	class Robber {
		constructor(play, resourcesToDiscard) {
			this.play = play;
			this.resourcesToDiscard = resourcesToDiscard;

			clients[turn].send(JSON.stringify({
				message: "chat", sender: -1, text: "Mueve el ladron"
			}));
		}

		onmessage(ws, player, message) {
			if (player != turn && message.message != "discard") {
				sendError(ws, "confirm");
				return false;
			}

			let toDiscard = this.resourcesToDiscard.reduce((x, y) => x + y, 0);

			switch (message.message) {
			default: sendError(ws, "message"); break;

			case "discard":
				if (
					Player.countResources(message.resources) != this.resourcesToDiscard[player] ||
					!players[player].hasResources(message.resources)
				) {
					sendError(ws, "discard");
					break;
				}

				this.resourcesToDiscard[player] = 0;
				players[player].spendResources(message.resources);

				ws.send(JSON.stringify({ message: "discard" }));
				sendResources(ws, players[player]);
				break;

			case "robber":
				
				
				if (
					toDiscard > 0 ||
					!board.tiles[message.y] || board.tiles[message.y][message.x] == null ||
					board.tiles[message.y][message.x] == Catan.OCEAN
				) {
					sendError(ws, "robber");
					break;
				}

				currentState = this.play;

				
				
				let targets = board.robberTargets(message.x, message.y, turn);
				if (targets.length > 0 && targets.indexOf(message.player) == -1) {
					sendError(ws, "robber");
					break;
				}

				board.robber = [message.x, message.y];
				clients.forEach(function (ws, player) {
					ws.send(JSON.stringify({ message: "robber", x: message.x, y: message.y }));
				});

				if (targets.length == 0) { break; }

				let playerResources = players[message.player].resources;
				let resources = Array.prototype.concat.apply([], Object.keys(playerResources).map(
					(type) => repeat(type, playerResources[type])
				));
				if (resources.length == 0) { break; }

				let resource = resources[Math.floor(Math.random() * resources.length)];
				players[player].resources[resource] += 1;
				players[message.player].resources[resource] -= 1;

				sendResources(ws, players[player]);
				sendResources(clients[message.player], players[message.player]);
				clients[message.player].send(JSON.stringify({
					message: "send", sender: -1,
					text: "Jugador " + player + " robo tus " + Catan.resourceNames[resource],
				}));
				break;
			}

			return;
		}
	}
	
	class Victory {
		onmessage(ws, player, message) {
			
			return;
		}
	}

	if (false) {
		board.build(Catan.TOWN, 3, 3, 0, 0, true);
		board.build(Catan.ROAD, 3, 3, 0, 0, true, { x: 3, y: 3, d: 0 });
		board.build(Catan.TOWN, 3, 2, 1, 0, true);
		board.build(Catan.ROAD, 4, 1, 1, 0, true, { x: 3, y: 2, d: 1 });
		board.build(Catan.TOWN, 3, 5, 1, 1, true);
		board.build(Catan.ROAD, 4, 4, 0, 1, true, { x: 3, y: 5, d: 1 });
		board.build(Catan.TOWN, 2, 3, 0, 1, true);
		board.build(Catan.ROAD, 1, 3, 2, 1, true, { x: 2, y: 3, d: 0 });
		board.build(Catan.TOWN, 5, 3, 0, 2, true);
		board.build(Catan.ROAD, 4, 3, 2, 2, true, { x: 5, y: 3, d: 0 });
		board.build(Catan.TOWN, 1, 5, 1, 2, true);
		board.build(Catan.ROAD, 2, 4, 0, 2, true, { x: 1, y: 5, d: 1 });
		board.build(Catan.TOWN, 2, 2, 1, 3, true);
		board.build(Catan.ROAD, 3, 1, 0, 3, true, { x: 2, y: 2, d: 1 });
		board.build(Catan.TOWN, 1, 2, 1, 3, true);
		board.build(Catan.ROAD, 1, 2, 2, 3, true, { x: 1, y: 2, d: 1 });


		clients.forEach(function (ws, player) {
			ws.send(JSON.stringify({ message: "start", board: board, player: player }));
			ws.send(JSON.stringify({ message: "turn", player: turn }));
			sendTurn(ws, player);
		});

		let ws = clients[turn];
		turn = (turn + clients.length - 1) % clients.length;

		currentState = new Play();
		currentState.onmessage(ws, turn, { message: "turn" }, true);
	} else {
		currentState = new Start();
	}

	function sendTurn(ws, player) {
		let playerName = player == turn ? "Tu" : "Turno de Jugador " + turn + " ";
		ws.send(JSON.stringify({ message: "chat", sender: -1, text: playerName + " " }));
	}

	function sendResources(ws, player) {
		ws.send(JSON.stringify({
			message: "resources",
			resources: player.resources,
			pieces: player.pieces,
			cards: player.cards,
		}));
	}

	function sendError(ws, message) {
		ws.send(JSON.stringify({ message: "error", error: message }));
	}
});

function rollDie() {
	return Math.floor(Math.random() * 6 + 1);
}

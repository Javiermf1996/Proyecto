(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

class Catan {
	constructor(board) {
		
		if (board) {
			Object.assign(this, board);
			return;
		}

		
		this.tiles = [];
		this.buildings = [];
		this.roads = [];

		
		this.maxRoadLength = 1;
		this.maxRoadPlayer = null;

		
		this.maxSoldiers = 2;
		this.maxSoldiersPlayer = null;

		for (let y = 0; y < 7; y++) {
			this.tiles[y] = repeat(null, 7);
			this.buildings[y] = [];
			this.roads[y] = [];

			for (let x = 0; x < 7; x++) {
				this.buildings[y][x] = repeat(null, 2);
				this.roads[y][x] = repeat(null, 3);
			}
		}

		this.hit = [];
		
		this.hit[7] = [];

		const cx = 3, cy = 3, N = 2;
		const directions = [[0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1]];

		
		let tilePool = shuffle(TILE_POOL.slice());
		let chitPool = rotate(CHIT_POOL.slice(), Math.random() * CHIT_POOL.length);
		let addTile = (x, y) => {
			let terrain = tilePool.pop();
			this.tiles[y][x] = terrain;

			let chit = terrain == Catan.NONE ? 0 : chitPool.pop();
			if (!this.hit[chit]) { this.hit[chit] = []; }
			this.hit[chit].push([x, y]);

			if (terrain == Catan.NONE) { this.robber = [x, y]; }
		}

		
		addTile(cx, cy);
		for (let radius = 1; radius <= N; radius++) {
			ring(cx, cy, radius, addTile);
		}

		
		ring(cx, cy, N + 1, (x, y) => {
			this.tiles[y][x] = Catan.OCEAN;
		});

		function ring(cx, cy, radius, callback) {
			let tx = cx + directions[4][0] * radius, ty = cy + directions[4][1] * radius;
			for (let side = 0; side < 6; side++) {
				let [dx, dy] = directions[side];
				for (let tile = 0; tile < radius; tile++) {
					callback(tx, ty);
					tx += dx;
					ty += dy;
				}
			}
		}
	}

	build(type, x, y, d, player, pregame, adjacent) {
		return {
			[Catan.ROAD]: this.buildRoad,
			[Catan.TOWN]: this.buildTown,
			[Catan.CITY]: this.buildCity,
		}[type].apply(this, [x, y, d, player, pregame, adjacent]);
	}

	validRoad(x, y, d, player, pregame, town) {
		
		if (!this.roads[y] || !this.roads[y][x]) { return false; }
		if (this.roads[y][x][d] != null) { return false; }

		
		if (!this.joiningTiles(x, y, d).some(([tx, ty]) => this.isGround(tx, ty))) { return false; }

		
		
		for (let [ex, ey, ed] of this.endpointVertices(x, y, d)) {
			if (!this.buildings[ey] || !this.buildings[ey][ex]) { continue; }
			if (this.buildings[ey][ex][ed] && this.buildings[ey][ex][ed].player == player) {
				if (!pregame) { return true; }
				else if (town && ex == town.x && ey == town.y && ed == town.d) { return true; }
			} else if (!pregame) {
				for (let [px, py, pd] of this.protrudeEdges(ex, ey, ed)) {
					if (!this.roads[py] || !this.roads[py][px]) { continue; }
					if (this.roads[py][px][pd] == player) { return true; }
				}
			}
		}

		return false;
	}

	
	buildRoad(x, y, d, player, pregame, adjacent) {
		if (!this.validRoad(x, y, d, player, pregame, adjacent)) { return false; }
		this.roads[y][x][d] = player;
		return true;
	}

	validTown(x, y, d, player, pregame) {
		if (!this.buildings[y] || !this.buildings[y][x]) { return false; }

		
		if (!this.touchesTiles(x, y, d).some(([tx, ty]) => this.isGround(tx, ty))) { return false; }

		
		if (this.buildings[y][x][d] != null) { return false; }
		for (let [ax, ay, ad] of this.adjacentVertices(x, y, d)) {
			if(!this.buildings[ay] || !this.buildings[ay][ax])
				continue;
			if (this.buildings[ay][ax][ad] != null) { return false; }
		}

		
		if (!pregame) {
			let touches = false;
			for(let [ex, ey, ed] of this.protrudeEdges(x, y, d)){
				if(this.roads[ey][ex][ed] == player)
					touches = true;
			}
			if (!touches) { return false; }
		}

		return true;
	}

	
	buildTown(x, y, d, player, pregame) {
		if (!this.validTown(x, y, d, player, pregame)) { return false; }
		this.buildings[y][x][d] = { player: player, type: Catan.TOWN };
		return true;
	}

	validCity(x, y, d, player) {
		
		if (!this.buildings[y] || !this.buildings[y][x] || !this.buildings[y][x][d]) {
			return false;
		}

		let building = this.buildings[y][x][d];
		if (building.player != player || building.type != Catan.TOWN) { return false; }
		return true;
	}

	buildCity(x, y, d, player) {
		if (!this.validCity(x, y, d, player)) { return false; }
		this.buildings[y][x][d] = { player: player, type: Catan.CITY };
		return true;
	}

	isGround(x, y) {
		return (
			this.tiles[y] && this.tiles[y][x] != null &&
			this.tiles[y][x] != Catan.OCEAN
		);
	}

	robberTargets(x, y, exclude) {
		let targets = [];
		for (let [vx, vy, vd] of this.cornerVertices(x, y)) {
			let building = this.buildings[vy][vx][vd];
			if (!building || building.player == exclude || targets.indexOf(building.player) > -1) {
				continue;
			}

			targets.push(building.player);
		}
		return targets;
	}

	forEachTile(cx, cy, N, callback) {
		for (let dx = -N; dx <= N; dx++) {
			for (let dy = Math.max(-N, -dx - N); dy <= Math.min(N, -dx + N); dy++) {
				let x = cx + dx, y = cy + dy;
				callback(x, y);
			}
		}
	}

	
	cornerVertices(x, y) {
		return [
			[x, y, 1], [x + 1, y, 0], [x - 1, y + 1, 1],
			[x, y, 0], [x - 1, y, 1], [x + 1, y - 1, 0],
		];
	}

	
	joiningTiles(x, y, d) {
		if (d == 0) { return [[x, y], [x - 1, y + 1]]; }
		else if (d == 1) { return [[x, y + 1], [x, y]]; }
		else if (d == 2) { return [[x + 1, y], [x, y]]; }
	}

	
	endpointVertices(x, y, d) {
		if (d == 0) { return [[x - 1, y + 1, 1], [x, y, 0]]; }
		else if (d == 1) { return [[x + 1, y, 0], [x - 1, y + 1, 1]]; }
		else if (d == 2) { return [[x, y, 1], [x + 1, y, 0]]; }
	}

	
	touchesTiles(x, y, d) {
		if (d == 0) { return [[x, y], [x-1, y], [x-1, y+1]]; }
		else if (d == 1) { return [[x+1, y], [x+1, y-1], [x,y]]; }
	}

	
	protrudeEdges(x, y, d) {
		if (d == 0) { return [[x, y, 0], [x - 1, y, 2], [x - 1, y, 1]]; }
		else if (d == 1) { return [[x + 1, y - 1, 1], [x + 1, y - 1, 0], [x, y, 2]]; }
	}

	
	adjacentVertices(x, y, d) {
		if (d == 0) { return [[x - 1, y + 1, 1], [x - 1, y, 1], [x - 2, y + 1, 1]]; }
		else if (d == 1) { return [[x + 2, y - 1, 0], [x + 1, y - 1, 0], [x + 1, y, 0]]; }
	}
};


Catan.ROAD = 0;
Catan.TOWN = 1;
Catan.CITY = 2;
Catan.CARD = 3;


Catan.NONE = 0;
Catan.ORE = 1;
Catan.WOOD = 2;
Catan.WOOL = 3;
Catan.GRAIN = 4;
Catan.BRICK = 5;
Catan.OCEAN = 6;

Catan.resourceNames = {
	[Catan.ORE]: "Mineral",
	[Catan.WOOD]: "Madera",
	[Catan.WOOL]: "Lana",
	[Catan.GRAIN]: "Trigo",
	[Catan.BRICK]: "Ladrillo",
};


Catan.KNIGHT = 0;
Catan.YEAR_OF_PLENTY = 1;
Catan.MONOPOLY = 2;
Catan.VICTORY_POINT = 3;
Catan.ROAD_BUILDING = 4;

const TILE_POOL = Array.prototype.concat(
	repeat(Catan.NONE, 1),
	repeat(Catan.ORE, 3),
	repeat(Catan.BRICK, 3),
	repeat(Catan.WOOD, 4),
	repeat(Catan.GRAIN, 4),
	repeat(Catan.WOOL, 4)
);

const CHIT_POOL = [ 5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11 ];

function repeat(element, times) {
	let array = [];
	for (let i = 0; i < times; i++) {
		array.push(element);
	}
	return array;
}


function shuffle(array) {
	for (let i = array.length; i > 0; i--) {
		let j = Math.floor(Math.random() * i);
		let tmp = array[i - 1];
		array[i - 1] = array[j];
		array[j] = tmp;
	}
	return array;
}

function rotate(array, count) {
	array.unshift.apply(array, array.splice(count));
	return array;
}

module.exports.Catan = Catan;
module.exports.repeat = repeat;
module.exports.shuffle = shuffle;

},{}],2:[function(require,module,exports){
"use strict";

let Catan = require("../catan").Catan,
	Player = require("../player"),
	Hex = require("./hex"),
	ResourceSprite, DevelopmentCard, DiceSprite;

let currentState;
let run = function (state) {
	currentState = state;
	(function update(time) {
		requestAnimationFrame(update);
		currentState.draw();
	})(performance.now());
};

const tileColors = ["#f46060", "#33425c", "#257025", "#0fd60f", "#ffff00", "#9c4444", "#0099ff"];
const playerColors = ["#ff0000", "#00bcff", "#ffbc00", "#008000"];

const server = "ws://" + window.location.hostname + ":8081";

class Lobby {
	constructor(ctx) {
		this.ctx = ctx;

		this.assets = {
			hexagon: new Image(), hexagons: [],
			town: new Image(), city: new Image(), towns: [], cities: [],
			pawn: new Image(),
			ore_sm: new Image(),
			logs_sm: new Image(),
			grain_sm: new Image(),
			wool_sm: new Image(),
			bricks_sm: new Image(),
			yearofplenty: new Image(),
			victorypoint: new Image(),
			roadbuilding: new Image(),
			monopoly: new Image(),
			soldier: new Image(),
			dice: new Image(),
			
		};
		this.assets.hexagon.addEventListener("load", () => {
			tileColors.forEach((color, i) => {
				this.assets.hexagons[i] = blend(this.assets.hexagon, color);
			});
		});
		this.assets.town.addEventListener("load", () => {
			playerColors.forEach((color, i) => {
				this.assets.towns[i] = blend(this.assets.town, color);
			});
		});
		this.assets.city.addEventListener("load", () => {
			playerColors.forEach((color, i) => {
				this.assets.cities[i] = blend(this.assets.city, color);
			});
		});

		function blend(image, color) {
			let blendCanvas = document.createElement("canvas");
			let blendCtx = blendCanvas.getContext("2d");

			blendCanvas.width = image.width;
			blendCanvas.height = image.height;

			blendCtx.fillStyle = color;
			blendCtx.fillRect(0, 0, blendCanvas.width, blendCanvas.height);

			blendCtx.globalCompositeOperation = "multiply";
			blendCtx.drawImage(image, 0, 0);

			blendCtx.globalCompositeOperation = "destination-atop";
			blendCtx.drawImage(image, 0, 0);

			return blendCanvas;
		}

		for (let asset in this.assets) {
			this.assets[asset].src = "assets/" + asset + ".png";
		}

		this.ws = new WebSocket(server);
		this.ws.onmessage = (event) => {
			console.log(event.data);

			let message = JSON.parse(event.data);
			switch (message.message) {
			case "start":
				this.board = new Catan(message.board);
				this.player = message.player;
				break;

			case "turn":
				this.turn = message.player;
				currentState = new Play(
					this.ctx, this.assets, this.ws,
					this.board, this.player, this.turn
				);
				break;

			case "end":
				currentState = new Lobby(ctx);
				break;
			}
		};
	}

	draw() {
		let ctx = this.ctx, width = ctx.canvas.clientWidth, height = ctx.canvas.clientHeight;

		ctx.fillStyle = "#000";
		ctx.fillRect(0, 0, width, height);

		ctx.font = "48px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = "#fff";
		ctx.fillText("Esperando Jugadores", width / 2, height / 2);
	}
}

class Play {
	constructor(ctx, assets, ws, board, player, turn) {
		this.ctx = ctx;
		this.assets = assets;
		this.ws = ws;

		this.board = board;
		this.hand = new Player();
		this.player = player;
		this.turn = turn;

		this.pregame = true;
		this.lastTown = [];

		this.sprites = [];

		this.tradingOffers = [];
		this.tradingOngoing = false;

		this.robber = this.board.robber;

		this.mouse = [0, 0];
		this.tile = [0, 0];
		this.vertex = [0, 0, 0];
		this.edge = [0, 0, 0];

		this.cards = [];
		let cardWidth = this.assets.soldier.width * 0.8;
		let cardHeight = this.assets.soldier.height * 0.8;
		for (let card in this.hand.cards) {
			let odd = card % 2 == 1;
			let sprite = new DevelopmentCard([
				canvas.width / 2 + 40 + card * (cardWidth + 10) / 2,
				canvas.height / 2 + 30 + odd * (cardHeight + 30)
			], [cardWidth, cardHeight]);
			this.cards[+card] = sprite;
		}
		
		this.longestRoad = null;
		this.longestRoadPlayer = null;
		this.largestArmy = null;
		this.largestArmyPlayer = null;

		this.ws.onmessage = (event) => {
			console.log(event.data);

			let message = JSON.parse(event.data);
			switch (message.message) {
			

			case "turn":
				this.turn = message.player;
				this.dice = message.dice;
				if (message.die1 && message.die2) {
					die1.start(message.die1);
					die2.start(message.die2);
				}
				
				if (message.start) {
					this.pregame = false;
					this.lastTown = [];
				}

				if (!this.dice) { break; }
				if (this.dice == 7) {
					if (this.player == message.player) { this.action = "moveRobber"; }

					let total = Player.countResources(this.hand.resources);
					if (total > 7) { showDiscardModal(Math.floor(total / 2)); }
				}

				for (let [hx, hy] of this.board.hit[this.dice]) {
					let resource = this.board.tiles[hy][hx];
					let [tpx, tpy] = Hex.tileToPixels(hx, hy);
					for (let [cx, cy, cd] of this.board.cornerVertices(hx, hy)) {
						if (!this.board.buildings[cy][cx][cd]) { continue; }

						let [vpx, vpy] = Hex.vertexToPixels(cx, cy, cd);
						this.sprites.push(new ResourceSprite(resource, [tpx, tpy], [vpx, vpy]));
					}
				}
				break;

			case "resources":
				this.hand.resources = message.resources;
				this.hand.pieces = message.pieces;
				this.hand.cards = message.cards;
				break;

			case "build":
				if (this.pregame && message.type == Catan.TOWN) {
					this.lastTown[message.player] = { x: message.x, y: message.y, d: message.d };
				}

				if (this.pendingCity) { delete this.pendingCity; }
				this.board.build(
					message.type, message.x, message.y, message.d, message.player,
					this.pregame, this.lastTown[message.player]
				);
				break;

			case "chat":
				let nameSpan, contentSpan;
				if (message.sender > -1) {
					let name = document.createTextNode("Jugador " + message.sender + ": ");
					nameSpan = document.createElement("span");
					nameSpan.style.color = playerColors[message.sender];
					nameSpan.appendChild(name);

					contentSpan = document.createTextNode(message.text);
				} else {
					nameSpan = document.createTextNode("");

					let content = document.createTextNode(message.text);
					contentSpan = document.createElement("span");
					contentSpan.style.fontWeight = "bold";
					contentSpan.appendChild(content);
				}

				let msgP = document.createElement("p");
				msgP.appendChild(nameSpan);
				msgP.appendChild(contentSpan);

				let chatBox = document.getElementById("chat-contents");
				chatBox.appendChild(msgP);
				chatBox.scrollTop = chatBox.scrollHeight;
				break;

			case "end":
				currentState = new Lobby(ctx);
				break;

			

			case "offer":
				this.tradingOngoing = true;
				this.tradingOffers[message.player] = message.offer;
				break;

			case "confirm":
				this.tradingOngoing = false;
				this.tradingOffers = [];
				break;

			

			case "discard":
				document.getElementById("discard-modal").style.display = "none";
				break;

			case "robber":
				this.board.robber = [message.x, message.y];
				if (this.action == "steal") { delete this.action; }
				break;

			case "error":
				if (message.error == "robber" && this.action == "steal") {
					this.action = "moveRobber";
				}

				if (
					message.error == "develop" &&
					(this.action == "moveRobber" || this.action == "steal")
				) {
					delete this.robber;
					delete this.action;
				}
				break;
			
			case "stats":
				this.longestRoad = message.longestRoad;
				this.longestRoadPlayer = message.longestRoadPlayer;
				this.largestArmy = message.largestArmy;
				this.largestArmyPlayer = message.largestArmyPlayer;
				break;
			}
		};
	}

	draw() {
		let ctx = this.ctx, width = ctx.canvas.clientWidth, height = ctx.canvas.clientHeight;

		ctx.fillStyle = "#000";
		ctx.fillRect(0, 0, width, height);

		ctx.font = "14px sans-serif";
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		ctx.fillStyle = "#fff";
		ctx.fillText("tu eres el jugador  " + this.player + " y es turno del jugador  " + this.turn + " ", 0, 0);

		let [mx, my] = this.tile, [mvx, mvy, mvd] = this.vertex, [mex, mey, med] = this.edge;
		if (false) {
			ctx.fillText("Mouse cursor on tile (" + mx + "," + my + ")", 0, 16);
			ctx.fillText("Mouse cursor near vertex (" + mvx + "," + mvy + "," + ["L", "R"][mvd] + ")", 0, 32);
			ctx.fillText("Mouse cursor near edge (" + mex + "," + mey + "," + ["W", "N", "E"][med] + ")", 0, 48);
		}

		let cx = 3, cy = 3, N = 3;

		
		this.board.forEachTile(cx, cy, N, (x, y) => {
			let [px, py] = Hex.tileToPixels(x, y);

			let image = this.assets.hexagons[this.board.tiles[y][x]] || this.assets.hexagon;
			let width = 2 * Hex.radius - 5, height = 2 * Hex.radius * Math.sin(Math.PI / 3) - 5;
			ctx.drawImage(image, px - width / 2, py - height / 2, width, height);
		});

		
		this.board.forEachTile(cx, cy, N, (x, y) => {
			for (let d = 0; d < 3; d++) {
				let road = this.board.roads[y][x][d];
				if (road == null) { continue; }

				drawRoad(playerColors[road], x, y, d);
			}
		});

		if (
			this.action == "buildRoad" &&
			this.board.validRoad(mex, mey, med, this.player, this.pregame, this.lastTown[this.player])
		) {
			ctx.globalAlpha = 0.5;
			drawRoad(playerColors[this.player], mex, mey, med);
			ctx.globalAlpha = 1.0;
		}

		function drawRoad(color, x, y, d) {
			let [[x1, y1, d1], [x2, y2, d2]] = currentState.board.endpointVertices(x, y, d);
			let [px1, py1] = Hex.vertexToPixels(x1, y1, d1);
			let [px2, py2] = Hex.vertexToPixels(x2, y2, d2);

			ctx.strokeStyle = color;
			ctx.lineWidth = 4;
			ctx.beginPath();
			ctx.moveTo(px1, py1);
			ctx.lineTo(px2, py2);
			ctx.stroke();
		}

		
		this.board.forEachTile(cx, cy, N, (x, y) => {
			for (let d = 0; d < 2; d++) {
				let building = this.board.buildings[y][x][d];
				if (!building) { continue; }

				
				if (
					this.action == "buildCity" && x == mvx && y == mvy && d == mvd &&
					this.board.validCity(x, y, d)
				) { continue; }

				let image;
				switch (building.type) {
				case Catan.TOWN: image = this.assets.towns[building.player]; break;
				case Catan.CITY: image = this.assets.cities[building.player]; break;
				}

				
				let pending = this.pendingCity;
				if (pending && pending.x == x && pending.y == y && pending.d == d) {
					image = this.assets.cities[building.player];
				}

				drawBuilding(image, x, y, d);
			}
		});

		if (this.action == "buildTown" && this.board.validTown(mvx, mvy, mvd)) {
			ctx.globalAlpha = 0.5;
			drawBuilding(this.assets.towns[this.player], mvx, mvy, mvd);
			ctx.globalAlpha = 1.0;
		}

		if (this.action == "buildCity" && this.board.validCity(mvx, mvy, mvd)) {
			ctx.globalAlpha = 0.5;
			drawBuilding(this.assets.cities[this.player], mvx, mvy, mvd);
			ctx.globalAlpha = 1.0;
		}

		function drawBuilding(image, x, y, d) {
			let [px, py] = Hex.vertexToPixels(x, y, d);
			ctx.drawImage(image, px - image.width / 2, py - image.height / 2);
		}

		
		this.board.hit.forEach((hit, i) => {
			if (hit == null || i == 0) { return; }

			ctx.font = "16px sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "0xfff";
			for (let [x, y] of hit) {
				let [px, py] = Hex.tileToPixels(x, y);

				ctx.fillText(i, px, py - 10);
				ctx.fillText(getPips(i), px, py+ 10);
			}

			function getPips(i) {
				switch (i) {
				case 2: case 12: return "•";
				case 3: case 11: return "••";
				case 4: case 10: return "•••";
				case 5: case 9: return "••••";
				case 6: case 8: return "•••••";
				}
			}
		});

		
		for (let i = this.sprites.length - 1; i >= 0; i--) {
			let sprite = this.sprites[i];
			if (sprite.move()) { this.sprites.splice(i, 1); }

			let image;
			switch (sprite.type) {
			case Catan.ORE: image = this.assets.ore_sm; break;
			case Catan.WOOD: image = this.assets.logs_sm; break;
			case Catan.WOOL: image = this.assets.wool_sm; break;
			case Catan.GRAIN: image = this.assets.grain_sm; break;
			case Catan.BRICK: image = this.assets.bricks_sm; break;
			}

			let [x, y] = sprite.pos, scale = sprite.scale;
			ctx.drawImage(
				image,
				x - scale * image.width / 2, y - scale * image.height / 2,
				scale * image.width, scale * image.height
			);
		}

		
		if (this.action != "moveRobber") {
			let [rx, ry] = this.action == "steal" ? this.robber : this.board.robber;
			drawRobber(this.assets.pawn, rx, ry);
		} else if (this.board.isGround(mx, my)) {
			ctx.globalAlpha = 0.5;
			drawRobber(this.assets.pawn, mx, my);
			ctx.globalAlpha = 1.0;
		}

		function drawRobber(image, x, y) {
			let [px, py] = Hex.tileToPixels(x, y);
			ctx.drawImage(image, px - image.width / 2, py - image.height / 2);
		}

		
		{
			ctx.font = "14px sans-serif";
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.fillStyle = "#fff";

			for (let piece in this.hand.pieces) {
				let y = piece * 16;
				ctx.fillText(Play.pieceNames[piece], width / 2 + 40 + 0, y);
				ctx.fillText(this.hand.pieces[piece], width / 2 + 40 + 50, y);
			}

			for (let resource in this.hand.resources) {
				let y = -16 + resource * 16;
				ctx.fillText(Catan.resourceNames[resource], width / 2 + 40 + 90, y);
				ctx.fillText(this.hand.resources[resource], width / 2 + 40 + 140, y);
			}

			ctx.textAlign = "center";
			for (let card in this.hand.cards) {
				card = +card;

				let image;
				switch (card) {
				case Catan.KNIGHT: image = this.assets.soldier; break;
				case Catan.MONOPOLY: image = this.assets.monopoly; break;
				case Catan.YEAR_OF_PLENTY: image = this.assets.yearofplenty; break;
				case Catan.VICTORY_POINT: image = this.assets.victorypoint; break;
				case Catan.ROAD_BUILDING: image = this.assets.roadbuilding; break;
				}

				let [x, y] = this.cards[card].pos;
				let scale = this.cards[card].scale;
				ctx.drawImage(image, x, y, image.width * scale, image.height * scale);

				let [tx, ty] = [x + image.width * 0.8 / 2, y + image.height * scale + 10];
				ctx.fillText("x" + this.hand.cards[card], tx, ty);
			}
			ctx.textAlign = "left";

			if (this.tradingOngoing) {
				ctx.fillText("Offers:", width / 2 + 40, 100);

				let j = 0;
				for (let i = 0; i < 4; i++) {
					let tx, ty;
					if (i == this.turn) {
						[tx, ty] = [width / 2 + 40, 132];
					} else {
						[tx, ty] = [width / 2 + 40 + 120 * j, 132 + 16 * 7];
						j++;
					}

					ctx.fillText("Jugador " + i + ":", tx, ty);
					let offerText = [];
					let offer = this.tradingOffers[i];
					for (let kind in offer) {
						if (!offer[kind]) { continue; }
						offerText.push(offer[kind] + " " + Catan.resourceNames[kind]);
					}
					offerText.forEach((text, row) => ctx.fillText(text, tx, ty + 16 * (row + 1)));
				}
			}
		}			
	
		
		die1.advance();
		ctx.drawImage(this.assets.dice, (die1.index - 1)*die1.size + 1, 1, die1.size, die1.size, die1.offset[0], die1.offset[1], die1.size * 0.8, die1.size * 0.8);
		die2.advance();
		ctx.drawImage(this.assets.dice, (die2.index - 1)*die2.size + 1, 1, die2.size, die2.size, die2.offset[0], die2.offset[1], die2.size * 0.8, die2.size * 0.8);
	}

	click() {
		let [tx, ty] = this.tile;
		let [vx, vy, vd] = this.vertex;
		let [ex, ey, ed] = this.edge;

		if (this.action == "moveRobber") {
			currentState.steal(tx, ty);
			return;
		}

		let type, x, y, d;
		switch (this.action) {
			default: return;

			case "buildRoad": sendBuild(this.ws, Catan.ROAD, ex, ey, ed); break;
			case "buildTown": sendBuild(this.ws, Catan.TOWN, vx, vy, vd); break;
			case "buildCity": sendBuild(this.ws, Catan.CITY, vx, vy, vd); break;
		}

		if (this.action == "buildCity") {
			this.pendingCity = { x: vx, y: vy, d: vd };
		}

		restoreDefaultButtons();
		delete this.action;

		function sendBuild(ws, type, x, y, d) {
			ws.send(JSON.stringify({ message: "build", type: type, x: x, y: y, d: d }));
		}
	}

	buyDevelop() {
		this.ws.send(JSON.stringify({ message: "Compra Desarrollo" }));
	}

	offer(offer) {
		this.ws.send(JSON.stringify({ message: "oferta", offer: offer }));
	}

	confirm(player) {
		this.ws.send(JSON.stringify({ message: "confirmar", player: player }));
	}

	cancel() {
		this.ws.send(JSON.stringify({ message: "cancelar" }));
	}

	steal(x, y) {
		this.robber = [x, y];
		this.action = "steal";

		let targets = this.board.robberTargets(x, y, this.player);

		
		if (targets.length == 0) {
			this.ws.send(JSON.stringify({ message: "robber", x: x, y: y }));
		}

		
		let buttons = [];
		for (let target of targets) {
			let button = document.createElement("button");

			buttons.push(button);
			document.forms.trading.appendChild(button);

			button.innerHTML = "Robar al jugador " + target;
			button.addEventListener("click", (event) => {
				event.preventDefault();

				this.ws.send(JSON.stringify({ message: "robber", x: x, y: y, player: target }));
				buttons.forEach((button) => document.forms.trading.removeChild(button));
			});
		}
	}

	endTurn() {
		this.ws.send(JSON.stringify({ message: "turn" }));
	}

	playRoadBuilding() {
		this.ws.send(JSON.stringify({ message: "develop", card: Catan.ROAD_BUILDING }));
	}

	playYearOfPlenty() {
		showYopModal();
	}

	playKnight() {
		this.ws.send(JSON.stringify({ message: "develop", card: Catan.KNIGHT }));
		this.action = "moveRobber";
	}

	playMonopoly() {
		showMonopolyModal();
	}
}

Play.pieceNames = {
	[Catan.ROAD]: "Carr.",
	[Catan.TOWN]: "Pueblo",
	[Catan.CITY]: "Ciudad",
};

Play.cardNames = {
	[Catan.KNIGHT]: "Caballero",
	[Catan.YEAR_OF_PLENTY]: "Año de abundancia",
	[Catan.MONOPOLY]: "Monopolio",
	[Catan.VICTORY_POINT]: "Punto de Victoria",
	[Catan.ROAD_BUILDING]: "2 carreteras",
};

ResourceSprite = class {
	constructor(type, start, end) {
		this.type = type;
		this.start = start;
		this.end = end;

		this.count = 0;
	}

	move() {
		let t = this.count / 90;
		this.count += 1;

		this.scale = lerp(0.5, 1, 4 * t);
		this.pos = lerp2(this.start, this.end, 1.5 * t - 0.5);

		return t > 1;

		function lerp(a, b, t) {
			t = Math.min(Math.max(0, t), 1);
			return (1 - t) * a + t * b;
		}
		function lerp2([ax, ay], [bx, by], t) { return [lerp(ax, bx, t), lerp(ay, by, t)]; }
	}
};

DevelopmentCard = class {
	constructor(position, size) {
		this.pos = position;
		this.size = size;
		this.scale = 0.8;
	}

	inCard(x, y) {
		return (
			this.pos[0] <= x && x < this.pos[0] + this.size[0] * this.scale &&
			this.pos[1] <= y && y < this.pos[1] + this.size[1] * this.scale
		);
	}
}

DiceSprite = class {
	
	constructor(size, offset){
		
		
		this.count = 48;
		
		
		this.index = 0;
		
		this.size = size;
		this.offset = offset;
		
		
		this.target = 0;
	}
 
	start(target){
		this.count = 0;
		this.target = target;
	}
	
 
	advance(){
		if(this.count < 48){
			this.count++;
			if(this.count % 4 == 0){
				this.index = Math.floor(Math.random()*6);
			}
		}
		else {
			this.index = this.target;
		}
	}
}

let canvas = document.getElementById("canvas");
canvas.width = Hex.width;
canvas.height = Hex.height;



canvas.addEventListener("mousemove", function (event) {
	let rect = canvas.getBoundingClientRect();
	let mouseX = currentState.mouseX = event.clientX - rect.left;
	let mouseY = currentState.mouseY = event.clientY - rect.top;

	currentState.tile = Hex.pixelsToTile(mouseX, mouseY);
	currentState.vertex = Hex.pixelsToVertex(mouseX, mouseY);
	currentState.edge = Hex.pixelsToEdge(mouseX, mouseY);
});

canvas.addEventListener("click", function (event) {
	event.preventDefault();
	
	if (!currentState.action) {
		for (let cardType in currentState.hand.cards) {
			cardType = +cardType;

			let cardCount = currentState.hand.cards[cardType];
			if (cardCount == 0) { continue; }

			let card = currentState.cards[cardType];
			let [tx, ty] = currentState.tile;
			if (card.inCard(currentState.mouseX, currentState.mouseY)) {
				switch (cardType) {
					case Catan.KNIGHT: currentState.playKnight(); break;
					case Catan.YEAR_OF_PLENTY: currentState.playYearOfPlenty(); break;
					case Catan.MONOPOLY: currentState.playMonopoly(); break;
					case Catan.ROAD_BUILDING: currentState.playRoadBuilding(); break;
				}
			}
		}

		return; 
	}

	currentState.click();
});


{
	let form = document.forms.building;

	let modalActions = ["moveRobber", "steal"];

	["buildRoad", "buildTown", "buildCity"].forEach(function (id, _, ids) {
		form[id].addEventListener("click", function (event) {
			event.preventDefault();
			if (modalActions.indexOf(currentState.action) > -1) { return; }

			restoreDefaultButtons();

			if (currentState.action == id) {
				delete currentState.action;
				return;
			}

			currentState.action = id;
			form[id].innerHTML = "Cancelar";
		});
	});

	form.buildCard.addEventListener("click", function (event) {
		event.preventDefault();
		if (modalActions.indexOf(currentState.action) > -1) { return; }

		currentState.buyDevelop();
	});

	form.endTurn.addEventListener("click", function (event) {
		event.preventDefault();
		if (modalActions.indexOf(currentState.action) > -1) { return; }

		if (currentState.action) {
			restoreDefaultButtons();
			delete currentState.action;
		}

		currentState.endTurn();
	});
}

function restoreDefaultButtons() {
	let form = document.forms.building;
	form.buildRoad.innerHTML = "Carretera";
	form.buildTown.innerHTML = "Pueblo";
	form.buildCity.innerHTML = "Ciudad";
}


{
	let form = document.forms.trading;

	form.offer.addEventListener("click", function (event) {
		event.preventDefault();
		currentState.offer({
			[Catan.ORE]: +form.ore.value,
			[Catan.WOOD]: +form.wood.value,
			[Catan.WOOL]: +form.wool.value,
			[Catan.GRAIN]: +form.grain.value,
			[Catan.BRICK]: +form.brick.value,
		});
	});

	form.cancel.addEventListener("click", function (event) {
		event.preventDefault();
		currentState.cancel();
	});

	[
		form.accept0, form.accept1, form.accept2, form.accept3
	].forEach(function (button, i) {
		button.addEventListener("click", function (event) {
			event.preventDefault();
			currentState.confirm(i);
		});
	});
}


{
	let form = document.forms.discard;

	form.discard.addEventListener("click", function (event) {
		event.preventDefault();

		let resources = {
			[Catan.ORE]: +form.ore.value,
			[Catan.WOOD]: +form.wood.value,
			[Catan.WOOL]: +form.wool.value,
			[Catan.GRAIN]: +form.grain.value,
			[Catan.BRICK]: +form.brick.value,
		};

		let toDiscard = Math.floor(Player.countResources(currentState.hand.resources) / 2);
		let discarded = Player.countResources(resources);
		if (discarded != toDiscard) {
			alert("tu debes descartarte.");
			return;
		}

		currentState.ws.send(JSON.stringify({ message: "descartar", resources: resources }));
	});

	[
		form.ore, form.wood, form.wool, form.grain, form.brick
	].forEach(function (input) { input.value = input.min = 0; });
}

function showDiscardModal(count) {
	let cards = (count > 1) ? "Cards" : "Card";
	document.getElementById("discard-amount").innerHTML = "Discard " + count + " " + cards;
	document.getElementById("discard-modal").style.display = "block";

	let form = document.forms.discard;
	form.ore.max = currentState.hand.resources[Catan.ORE];
	form.wood.max = currentState.hand.resources[Catan.WOOD];
	form.wool.max = currentState.hand.resources[Catan.WOOL];
	form.grain.max = currentState.hand.resources[Catan.GRAIN];
	form.brick.max = currentState.hand.resources[Catan.BRICK];
}

function hideDiscardModal() {
	document.getElementById('discard-modal').style.display = "none";
}


{
	let form = document.forms.chat;

	form.addEventListener("submit", function (event) {
		event.preventDefault();

		currentState.ws.send(JSON.stringify({ message: "chat", text: form.message.value }));
		form.reset();
	});
}

let showYopModal = function () {
	document.getElementById('yop-modal').style.display = "block";
}

let hideYopModal = function () {
	document.getElementById('yop-modal').style.display = "none";
}

document.getElementById('yop-btn').addEventListener("click", function (event) {
	event.preventDefault();
	let choice1 = +document.forms.yop.choice1.value;
	let choice2 = +document.forms.yop.choice2.value;
	currentState.ws.send(JSON.stringify({ message: "develop", card: Catan.YEAR_OF_PLENTY, resources: [choice1, choice2] }));
	hideYopModal();
});

let showMonopolyModal = function () {
	document.getElementById('monopoly-modal').style.display = "block";
}

let hideMonopolyModal = function () {
	document.getElementById('monopoly-modal').style.display = "none";
}

document.getElementById('monopoly-btn').addEventListener("click", function (event) {
	event.preventDefault();
	let choice = +document.forms.monopoly.choice.value;
	currentState.ws.send(JSON.stringify({ message: "develop", card: Catan.MONOPOLY, terrain: choice }));
	hideMonopolyModal();
});

let ctx = canvas.getContext("2d");
let lobby = new Lobby(ctx);
run(lobby);
 
let die1 = new DiceSprite(100, [10, 550]);
let die2 = new DiceSprite(100, [87, 550]);

},{"../catan":1,"../player":4,"./hex":3}],3:[function(require,module,exports){
let radius = 45,
	hexagon_narrow_width = 3 / 2 * radius,
	hexagon_height = 2 * radius * Math.sin(Math.PI / 3),
	width = 960, height = 640;

module.exports = { radius: radius, width: width, height: height, };

let tileToPixels = module.exports.tileToPixels = function (x, y) {
	let xx = x - 3, yy = y - 3;
	return [
		width / 4 + 20 + hexagon_narrow_width * xx,
		height / 2 - hexagon_height * (xx / 2 + yy)
	];
};

let vertexToPixels = module.exports.vertexToPixels = function (x, y, d) {
	let [px, py] = tileToPixels(x, y);
	if (d == 0) { px -= radius; }
	else if (d == 1) { px += radius; }
	return [px, py];
};

let pixelsToTile = module.exports.pixelsToTile = function (px, py) {
	
	let x = (px - width / 4 - 20) / hexagon_narrow_width,
		y = (height / 2 - py) / hexagon_height - x / 2,
		z = -(x + y);

	
	let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
	let dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);

	
	if (dx > dy && dx > dz) {
		rx = -(ry + rz);
	} else if (dy > dz) {
		ry = -(rx + rz);
	} else {
		rz = -(rx + ry);
	}

	return [rx + 3, ry + 3];
};

let pixelsToVertex = module.exports.pixelsToVertex = function (px, py) {
	let [x, y] = pixelsToTile(px, py);
	let [cx, cy] = tileToPixels(x, y);
	let angle = Math.atan2(cy - py, px - cx);
	let hextant = (Math.floor((angle + Math.PI / 6) / 2 / Math.PI * 6) + 6) % 6;

	switch (hextant) {
	case 0: return [x, y, 1];
	case 1: return [x + 1, y, 0];
	case 2: return [x - 1, y + 1, 1];
	case 3: return [x, y, 0];
	case 4: return [x - 1, y, 1];
	case 5: return [x + 1, y - 1, 0];
	}
};

let pixelsToEdge = module.exports.pixelsToEdge = function (px, py) {
	let [x, y] = pixelsToTile(px, py);
	let [cx, cy] = tileToPixels(x, y);
	let angle = Math.atan2(cy - py, px - cx);
	let hextant = (Math.floor(angle / 2 / Math.PI * 6) + 6) % 6;

	switch (hextant) {
	case 0: return [x, y, 2];
	case 1: return [x, y, 1];
	case 2: return [x, y, 0];
	case 3: return [x - 1, y, 2];
	case 4: return [x, y - 1, 1];
	case 5: return [x + 1, y - 1, 0];
	}
};
},{}],4:[function(require,module,exports){
"use strict";

let Catan = require("./catan").Catan;

const COST = {
	[Catan.ROAD]: { [Catan.BRICK]: 1, [Catan.WOOD]: 1 },
	[Catan.TOWN]: { [Catan.BRICK]: 1, [Catan.WOOD]: 1, [Catan.GRAIN]: 1, [Catan.WOOL]: 1 },
	[Catan.CITY]: { [Catan.GRAIN]: 2, [Catan.ORE]: 3 },
	[Catan.CARD]: { [Catan.WOOL]: 1, [Catan.GRAIN]: 1, [Catan.ORE]: 1 },
};

class Player{
	constructor() {
		
		this.pieces = {
			[Catan.ROAD]: 15,
			[Catan.TOWN]: 5,
			[Catan.CITY]: 4,
		};

		
		this.resources = {
			[Catan.ORE]: 0,
			[Catan.WOOD]: 0,
			[Catan.WOOL]: 0,
			[Catan.GRAIN]: 0,
			[Catan.BRICK]: 0,
		};
		this.cards = {
			[Catan.KNIGHT]: 0,
			[Catan.YEAR_OF_PLENTY]: 0,
			[Catan.MONOPOLY]: 0,
			[Catan.VICTORY_POINT]: 0,
			[Catan.ROAD_BUILDING]: 0,
		};

		this.knights = 0;
	}

	hasResources(resourceSet) {
		for (let resourceType in resourceSet) {
			if (this.resources[resourceType] < resourceSet[resourceType]) {
				return false;
			}
		}

		return true;
	}

	spendResources(resourceSet) {
		for (let resourceType in resourceSet) {
			this.resources[resourceType] -= resourceSet[resourceType];
		}
	}

	canAfford(type) {
		if (this.pieces[type] == 0) {
			return false;
		}

		return this.hasResources(COST[type]);
	}

	build(type) {
		if (type != Catan.CARD) { this.pieces[type] -= 1; }
		this.spendResources(COST[type]);
	}
};

Player.countResources = function (hand) {
	let sum = 0;
	for (let resourceType in hand) {
		sum += hand[resourceType];
	}
	return sum;
}

module.exports = Player;

},{"./catan":1}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJjYXRhbi5qcyIsImNsaWVudC9hcHAuanMiLCJjbGllbnQvaGV4LmpzIiwicGxheWVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDclRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeDdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmNsYXNzIENhdGFuIHtcblx0Y29uc3RydWN0b3IoYm9hcmQpIHtcblx0XHRcblx0XHRpZiAoYm9hcmQpIHtcblx0XHRcdE9iamVjdC5hc3NpZ24odGhpcywgYm9hcmQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdFxuXHRcdHRoaXMudGlsZXMgPSBbXTtcblx0XHR0aGlzLmJ1aWxkaW5ncyA9IFtdO1xuXHRcdHRoaXMucm9hZHMgPSBbXTtcblxuXHRcdFxuXHRcdHRoaXMubWF4Um9hZExlbmd0aCA9IDE7XG5cdFx0dGhpcy5tYXhSb2FkUGxheWVyID0gbnVsbDtcblxuXHRcdFxuXHRcdHRoaXMubWF4U29sZGllcnMgPSAyO1xuXHRcdHRoaXMubWF4U29sZGllcnNQbGF5ZXIgPSBudWxsO1xuXG5cdFx0Zm9yIChsZXQgeSA9IDA7IHkgPCA3OyB5KyspIHtcblx0XHRcdHRoaXMudGlsZXNbeV0gPSByZXBlYXQobnVsbCwgNyk7XG5cdFx0XHR0aGlzLmJ1aWxkaW5nc1t5XSA9IFtdO1xuXHRcdFx0dGhpcy5yb2Fkc1t5XSA9IFtdO1xuXG5cdFx0XHRmb3IgKGxldCB4ID0gMDsgeCA8IDc7IHgrKykge1xuXHRcdFx0XHR0aGlzLmJ1aWxkaW5nc1t5XVt4XSA9IHJlcGVhdChudWxsLCAyKTtcblx0XHRcdFx0dGhpcy5yb2Fkc1t5XVt4XSA9IHJlcGVhdChudWxsLCAzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmhpdCA9IFtdO1xuXHRcdFxuXHRcdHRoaXMuaGl0WzddID0gW107XG5cblx0XHRjb25zdCBjeCA9IDMsIGN5ID0gMywgTiA9IDI7XG5cdFx0Y29uc3QgZGlyZWN0aW9ucyA9IFtbMCwgMV0sIFsxLCAwXSwgWzEsIC0xXSwgWzAsIC0xXSwgWy0xLCAwXSwgWy0xLCAxXV07XG5cblx0XHRcblx0XHRsZXQgdGlsZVBvb2wgPSBzaHVmZmxlKFRJTEVfUE9PTC5zbGljZSgpKTtcblx0XHRsZXQgY2hpdFBvb2wgPSByb3RhdGUoQ0hJVF9QT09MLnNsaWNlKCksIE1hdGgucmFuZG9tKCkgKiBDSElUX1BPT0wubGVuZ3RoKTtcblx0XHRsZXQgYWRkVGlsZSA9ICh4LCB5KSA9PiB7XG5cdFx0XHRsZXQgdGVycmFpbiA9IHRpbGVQb29sLnBvcCgpO1xuXHRcdFx0dGhpcy50aWxlc1t5XVt4XSA9IHRlcnJhaW47XG5cblx0XHRcdGxldCBjaGl0ID0gdGVycmFpbiA9PSBDYXRhbi5OT05FID8gMCA6IGNoaXRQb29sLnBvcCgpO1xuXHRcdFx0aWYgKCF0aGlzLmhpdFtjaGl0XSkgeyB0aGlzLmhpdFtjaGl0XSA9IFtdOyB9XG5cdFx0XHR0aGlzLmhpdFtjaGl0XS5wdXNoKFt4LCB5XSk7XG5cblx0XHRcdGlmICh0ZXJyYWluID09IENhdGFuLk5PTkUpIHsgdGhpcy5yb2JiZXIgPSBbeCwgeV07IH1cblx0XHR9XG5cblx0XHRcblx0XHRhZGRUaWxlKGN4LCBjeSk7XG5cdFx0Zm9yIChsZXQgcmFkaXVzID0gMTsgcmFkaXVzIDw9IE47IHJhZGl1cysrKSB7XG5cdFx0XHRyaW5nKGN4LCBjeSwgcmFkaXVzLCBhZGRUaWxlKTtcblx0XHR9XG5cblx0XHRcblx0XHRyaW5nKGN4LCBjeSwgTiArIDEsICh4LCB5KSA9PiB7XG5cdFx0XHR0aGlzLnRpbGVzW3ldW3hdID0gQ2F0YW4uT0NFQU47XG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiByaW5nKGN4LCBjeSwgcmFkaXVzLCBjYWxsYmFjaykge1xuXHRcdFx0bGV0IHR4ID0gY3ggKyBkaXJlY3Rpb25zWzRdWzBdICogcmFkaXVzLCB0eSA9IGN5ICsgZGlyZWN0aW9uc1s0XVsxXSAqIHJhZGl1cztcblx0XHRcdGZvciAobGV0IHNpZGUgPSAwOyBzaWRlIDwgNjsgc2lkZSsrKSB7XG5cdFx0XHRcdGxldCBbZHgsIGR5XSA9IGRpcmVjdGlvbnNbc2lkZV07XG5cdFx0XHRcdGZvciAobGV0IHRpbGUgPSAwOyB0aWxlIDwgcmFkaXVzOyB0aWxlKyspIHtcblx0XHRcdFx0XHRjYWxsYmFjayh0eCwgdHkpO1xuXHRcdFx0XHRcdHR4ICs9IGR4O1xuXHRcdFx0XHRcdHR5ICs9IGR5O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YnVpbGQodHlwZSwgeCwgeSwgZCwgcGxheWVyLCBwcmVnYW1lLCBhZGphY2VudCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRbQ2F0YW4uUk9BRF06IHRoaXMuYnVpbGRSb2FkLFxuXHRcdFx0W0NhdGFuLlRPV05dOiB0aGlzLmJ1aWxkVG93bixcblx0XHRcdFtDYXRhbi5DSVRZXTogdGhpcy5idWlsZENpdHksXG5cdFx0fVt0eXBlXS5hcHBseSh0aGlzLCBbeCwgeSwgZCwgcGxheWVyLCBwcmVnYW1lLCBhZGphY2VudF0pO1xuXHR9XG5cblx0dmFsaWRSb2FkKHgsIHksIGQsIHBsYXllciwgcHJlZ2FtZSwgdG93bikge1xuXHRcdFxuXHRcdGlmICghdGhpcy5yb2Fkc1t5XSB8fCAhdGhpcy5yb2Fkc1t5XVt4XSkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRpZiAodGhpcy5yb2Fkc1t5XVt4XVtkXSAhPSBudWxsKSB7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0XG5cdFx0aWYgKCF0aGlzLmpvaW5pbmdUaWxlcyh4LCB5LCBkKS5zb21lKChbdHgsIHR5XSkgPT4gdGhpcy5pc0dyb3VuZCh0eCwgdHkpKSkgeyByZXR1cm4gZmFsc2U7IH1cblxuXHRcdFxuXHRcdFxuXHRcdGZvciAobGV0IFtleCwgZXksIGVkXSBvZiB0aGlzLmVuZHBvaW50VmVydGljZXMoeCwgeSwgZCkpIHtcblx0XHRcdGlmICghdGhpcy5idWlsZGluZ3NbZXldIHx8ICF0aGlzLmJ1aWxkaW5nc1tleV1bZXhdKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRpZiAodGhpcy5idWlsZGluZ3NbZXldW2V4XVtlZF0gJiYgdGhpcy5idWlsZGluZ3NbZXldW2V4XVtlZF0ucGxheWVyID09IHBsYXllcikge1xuXHRcdFx0XHRpZiAoIXByZWdhbWUpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRcdFx0ZWxzZSBpZiAodG93biAmJiBleCA9PSB0b3duLnggJiYgZXkgPT0gdG93bi55ICYmIGVkID09IHRvd24uZCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0fSBlbHNlIGlmICghcHJlZ2FtZSkge1xuXHRcdFx0XHRmb3IgKGxldCBbcHgsIHB5LCBwZF0gb2YgdGhpcy5wcm90cnVkZUVkZ2VzKGV4LCBleSwgZWQpKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLnJvYWRzW3B5XSB8fCAhdGhpcy5yb2Fkc1tweV1bcHhdKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdFx0aWYgKHRoaXMucm9hZHNbcHldW3B4XVtwZF0gPT0gcGxheWVyKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRcblx0YnVpbGRSb2FkKHgsIHksIGQsIHBsYXllciwgcHJlZ2FtZSwgYWRqYWNlbnQpIHtcblx0XHRpZiAoIXRoaXMudmFsaWRSb2FkKHgsIHksIGQsIHBsYXllciwgcHJlZ2FtZSwgYWRqYWNlbnQpKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdHRoaXMucm9hZHNbeV1beF1bZF0gPSBwbGF5ZXI7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHR2YWxpZFRvd24oeCwgeSwgZCwgcGxheWVyLCBwcmVnYW1lKSB7XG5cdFx0aWYgKCF0aGlzLmJ1aWxkaW5nc1t5XSB8fCAhdGhpcy5idWlsZGluZ3NbeV1beF0pIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHRcblx0XHRpZiAoIXRoaXMudG91Y2hlc1RpbGVzKHgsIHksIGQpLnNvbWUoKFt0eCwgdHldKSA9PiB0aGlzLmlzR3JvdW5kKHR4LCB0eSkpKSB7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0XG5cdFx0aWYgKHRoaXMuYnVpbGRpbmdzW3ldW3hdW2RdICE9IG51bGwpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0Zm9yIChsZXQgW2F4LCBheSwgYWRdIG9mIHRoaXMuYWRqYWNlbnRWZXJ0aWNlcyh4LCB5LCBkKSkge1xuXHRcdFx0aWYoIXRoaXMuYnVpbGRpbmdzW2F5XSB8fCAhdGhpcy5idWlsZGluZ3NbYXldW2F4XSlcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRpZiAodGhpcy5idWlsZGluZ3NbYXldW2F4XVthZF0gIT0gbnVsbCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHR9XG5cblx0XHRcblx0XHRpZiAoIXByZWdhbWUpIHtcblx0XHRcdGxldCB0b3VjaGVzID0gZmFsc2U7XG5cdFx0XHRmb3IobGV0IFtleCwgZXksIGVkXSBvZiB0aGlzLnByb3RydWRlRWRnZXMoeCwgeSwgZCkpe1xuXHRcdFx0XHRpZih0aGlzLnJvYWRzW2V5XVtleF1bZWRdID09IHBsYXllcilcblx0XHRcdFx0XHR0b3VjaGVzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghdG91Y2hlcykgeyByZXR1cm4gZmFsc2U7IH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdFxuXHRidWlsZFRvd24oeCwgeSwgZCwgcGxheWVyLCBwcmVnYW1lKSB7XG5cdFx0aWYgKCF0aGlzLnZhbGlkVG93bih4LCB5LCBkLCBwbGF5ZXIsIHByZWdhbWUpKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdHRoaXMuYnVpbGRpbmdzW3ldW3hdW2RdID0geyBwbGF5ZXI6IHBsYXllciwgdHlwZTogQ2F0YW4uVE9XTiB9O1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0dmFsaWRDaXR5KHgsIHksIGQsIHBsYXllcikge1xuXHRcdFxuXHRcdGlmICghdGhpcy5idWlsZGluZ3NbeV0gfHwgIXRoaXMuYnVpbGRpbmdzW3ldW3hdIHx8ICF0aGlzLmJ1aWxkaW5nc1t5XVt4XVtkXSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBidWlsZGluZyA9IHRoaXMuYnVpbGRpbmdzW3ldW3hdW2RdO1xuXHRcdGlmIChidWlsZGluZy5wbGF5ZXIgIT0gcGxheWVyIHx8IGJ1aWxkaW5nLnR5cGUgIT0gQ2F0YW4uVE9XTikgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGJ1aWxkQ2l0eSh4LCB5LCBkLCBwbGF5ZXIpIHtcblx0XHRpZiAoIXRoaXMudmFsaWRDaXR5KHgsIHksIGQsIHBsYXllcikpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0dGhpcy5idWlsZGluZ3NbeV1beF1bZF0gPSB7IHBsYXllcjogcGxheWVyLCB0eXBlOiBDYXRhbi5DSVRZIH07XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpc0dyb3VuZCh4LCB5KSB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHRoaXMudGlsZXNbeV0gJiYgdGhpcy50aWxlc1t5XVt4XSAhPSBudWxsICYmXG5cdFx0XHR0aGlzLnRpbGVzW3ldW3hdICE9IENhdGFuLk9DRUFOXG5cdFx0KTtcblx0fVxuXG5cdHJvYmJlclRhcmdldHMoeCwgeSwgZXhjbHVkZSkge1xuXHRcdGxldCB0YXJnZXRzID0gW107XG5cdFx0Zm9yIChsZXQgW3Z4LCB2eSwgdmRdIG9mIHRoaXMuY29ybmVyVmVydGljZXMoeCwgeSkpIHtcblx0XHRcdGxldCBidWlsZGluZyA9IHRoaXMuYnVpbGRpbmdzW3Z5XVt2eF1bdmRdO1xuXHRcdFx0aWYgKCFidWlsZGluZyB8fCBidWlsZGluZy5wbGF5ZXIgPT0gZXhjbHVkZSB8fCB0YXJnZXRzLmluZGV4T2YoYnVpbGRpbmcucGxheWVyKSA+IC0xKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0YXJnZXRzLnB1c2goYnVpbGRpbmcucGxheWVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRhcmdldHM7XG5cdH1cblxuXHRmb3JFYWNoVGlsZShjeCwgY3ksIE4sIGNhbGxiYWNrKSB7XG5cdFx0Zm9yIChsZXQgZHggPSAtTjsgZHggPD0gTjsgZHgrKykge1xuXHRcdFx0Zm9yIChsZXQgZHkgPSBNYXRoLm1heCgtTiwgLWR4IC0gTik7IGR5IDw9IE1hdGgubWluKE4sIC1keCArIE4pOyBkeSsrKSB7XG5cdFx0XHRcdGxldCB4ID0gY3ggKyBkeCwgeSA9IGN5ICsgZHk7XG5cdFx0XHRcdGNhbGxiYWNrKHgsIHkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdFxuXHRjb3JuZXJWZXJ0aWNlcyh4LCB5KSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdFt4LCB5LCAxXSwgW3ggKyAxLCB5LCAwXSwgW3ggLSAxLCB5ICsgMSwgMV0sXG5cdFx0XHRbeCwgeSwgMF0sIFt4IC0gMSwgeSwgMV0sIFt4ICsgMSwgeSAtIDEsIDBdLFxuXHRcdF07XG5cdH1cblxuXHRcblx0am9pbmluZ1RpbGVzKHgsIHksIGQpIHtcblx0XHRpZiAoZCA9PSAwKSB7IHJldHVybiBbW3gsIHldLCBbeCAtIDEsIHkgKyAxXV07IH1cblx0XHRlbHNlIGlmIChkID09IDEpIHsgcmV0dXJuIFtbeCwgeSArIDFdLCBbeCwgeV1dOyB9XG5cdFx0ZWxzZSBpZiAoZCA9PSAyKSB7IHJldHVybiBbW3ggKyAxLCB5XSwgW3gsIHldXTsgfVxuXHR9XG5cblx0XG5cdGVuZHBvaW50VmVydGljZXMoeCwgeSwgZCkge1xuXHRcdGlmIChkID09IDApIHsgcmV0dXJuIFtbeCAtIDEsIHkgKyAxLCAxXSwgW3gsIHksIDBdXTsgfVxuXHRcdGVsc2UgaWYgKGQgPT0gMSkgeyByZXR1cm4gW1t4ICsgMSwgeSwgMF0sIFt4IC0gMSwgeSArIDEsIDFdXTsgfVxuXHRcdGVsc2UgaWYgKGQgPT0gMikgeyByZXR1cm4gW1t4LCB5LCAxXSwgW3ggKyAxLCB5LCAwXV07IH1cblx0fVxuXG5cdFxuXHR0b3VjaGVzVGlsZXMoeCwgeSwgZCkge1xuXHRcdGlmIChkID09IDApIHsgcmV0dXJuIFtbeCwgeV0sIFt4LTEsIHldLCBbeC0xLCB5KzFdXTsgfVxuXHRcdGVsc2UgaWYgKGQgPT0gMSkgeyByZXR1cm4gW1t4KzEsIHldLCBbeCsxLCB5LTFdLCBbeCx5XV07IH1cblx0fVxuXG5cdFxuXHRwcm90cnVkZUVkZ2VzKHgsIHksIGQpIHtcblx0XHRpZiAoZCA9PSAwKSB7IHJldHVybiBbW3gsIHksIDBdLCBbeCAtIDEsIHksIDJdLCBbeCAtIDEsIHksIDFdXTsgfVxuXHRcdGVsc2UgaWYgKGQgPT0gMSkgeyByZXR1cm4gW1t4ICsgMSwgeSAtIDEsIDFdLCBbeCArIDEsIHkgLSAxLCAwXSwgW3gsIHksIDJdXTsgfVxuXHR9XG5cblx0XG5cdGFkamFjZW50VmVydGljZXMoeCwgeSwgZCkge1xuXHRcdGlmIChkID09IDApIHsgcmV0dXJuIFtbeCAtIDEsIHkgKyAxLCAxXSwgW3ggLSAxLCB5LCAxXSwgW3ggLSAyLCB5ICsgMSwgMV1dOyB9XG5cdFx0ZWxzZSBpZiAoZCA9PSAxKSB7IHJldHVybiBbW3ggKyAyLCB5IC0gMSwgMF0sIFt4ICsgMSwgeSAtIDEsIDBdLCBbeCArIDEsIHksIDBdXTsgfVxuXHR9XG59O1xuXG5cbkNhdGFuLlJPQUQgPSAwO1xuQ2F0YW4uVE9XTiA9IDE7XG5DYXRhbi5DSVRZID0gMjtcbkNhdGFuLkNBUkQgPSAzO1xuXG5cbkNhdGFuLk5PTkUgPSAwO1xuQ2F0YW4uT1JFID0gMTtcbkNhdGFuLldPT0QgPSAyO1xuQ2F0YW4uV09PTCA9IDM7XG5DYXRhbi5HUkFJTiA9IDQ7XG5DYXRhbi5CUklDSyA9IDU7XG5DYXRhbi5PQ0VBTiA9IDY7XG5cbkNhdGFuLnJlc291cmNlTmFtZXMgPSB7XG5cdFtDYXRhbi5PUkVdOiBcIk1pbmVyYWxcIixcblx0W0NhdGFuLldPT0RdOiBcIk1hZGVyYVwiLFxuXHRbQ2F0YW4uV09PTF06IFwiTGFuYVwiLFxuXHRbQ2F0YW4uR1JBSU5dOiBcIlRyaWdvXCIsXG5cdFtDYXRhbi5CUklDS106IFwiTGFkcmlsbG9cIixcbn07XG5cblxuQ2F0YW4uS05JR0hUID0gMDtcbkNhdGFuLllFQVJfT0ZfUExFTlRZID0gMTtcbkNhdGFuLk1PTk9QT0xZID0gMjtcbkNhdGFuLlZJQ1RPUllfUE9JTlQgPSAzO1xuQ2F0YW4uUk9BRF9CVUlMRElORyA9IDQ7XG5cbmNvbnN0IFRJTEVfUE9PTCA9IEFycmF5LnByb3RvdHlwZS5jb25jYXQoXG5cdHJlcGVhdChDYXRhbi5OT05FLCAxKSxcblx0cmVwZWF0KENhdGFuLk9SRSwgMyksXG5cdHJlcGVhdChDYXRhbi5CUklDSywgMyksXG5cdHJlcGVhdChDYXRhbi5XT09ELCA0KSxcblx0cmVwZWF0KENhdGFuLkdSQUlOLCA0KSxcblx0cmVwZWF0KENhdGFuLldPT0wsIDQpXG4pO1xuXG5jb25zdCBDSElUX1BPT0wgPSBbIDUsIDIsIDYsIDMsIDgsIDEwLCA5LCAxMiwgMTEsIDQsIDgsIDEwLCA5LCA0LCA1LCA2LCAzLCAxMSBdO1xuXG5mdW5jdGlvbiByZXBlYXQoZWxlbWVudCwgdGltZXMpIHtcblx0bGV0IGFycmF5ID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgdGltZXM7IGkrKykge1xuXHRcdGFycmF5LnB1c2goZWxlbWVudCk7XG5cdH1cblx0cmV0dXJuIGFycmF5O1xufVxuXG5cbmZ1bmN0aW9uIHNodWZmbGUoYXJyYXkpIHtcblx0Zm9yIChsZXQgaSA9IGFycmF5Lmxlbmd0aDsgaSA+IDA7IGktLSkge1xuXHRcdGxldCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogaSk7XG5cdFx0bGV0IHRtcCA9IGFycmF5W2kgLSAxXTtcblx0XHRhcnJheVtpIC0gMV0gPSBhcnJheVtqXTtcblx0XHRhcnJheVtqXSA9IHRtcDtcblx0fVxuXHRyZXR1cm4gYXJyYXk7XG59XG5cbmZ1bmN0aW9uIHJvdGF0ZShhcnJheSwgY291bnQpIHtcblx0YXJyYXkudW5zaGlmdC5hcHBseShhcnJheSwgYXJyYXkuc3BsaWNlKGNvdW50KSk7XG5cdHJldHVybiBhcnJheTtcbn1cblxubW9kdWxlLmV4cG9ydHMuQ2F0YW4gPSBDYXRhbjtcbm1vZHVsZS5leHBvcnRzLnJlcGVhdCA9IHJlcGVhdDtcbm1vZHVsZS5leHBvcnRzLnNodWZmbGUgPSBzaHVmZmxlO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmxldCBDYXRhbiA9IHJlcXVpcmUoXCIuLi9jYXRhblwiKS5DYXRhbixcblx0UGxheWVyID0gcmVxdWlyZShcIi4uL3BsYXllclwiKSxcblx0SGV4ID0gcmVxdWlyZShcIi4vaGV4XCIpLFxuXHRSZXNvdXJjZVNwcml0ZSwgRGV2ZWxvcG1lbnRDYXJkLCBEaWNlU3ByaXRlO1xuXG5sZXQgY3VycmVudFN0YXRlO1xubGV0IHJ1biA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuXHRjdXJyZW50U3RhdGUgPSBzdGF0ZTtcblx0KGZ1bmN0aW9uIHVwZGF0ZSh0aW1lKSB7XG5cdFx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKHVwZGF0ZSk7XG5cdFx0Y3VycmVudFN0YXRlLmRyYXcoKTtcblx0fSkocGVyZm9ybWFuY2Uubm93KCkpO1xufTtcblxuY29uc3QgdGlsZUNvbG9ycyA9IFtcIiNmNDYwNjBcIiwgXCIjMzM0MjVjXCIsIFwiIzI1NzAyNVwiLCBcIiMwZmQ2MGZcIiwgXCIjZmZmZjAwXCIsIFwiIzljNDQ0NFwiLCBcIiMwMDk5ZmZcIl07XG5jb25zdCBwbGF5ZXJDb2xvcnMgPSBbXCIjZmYwMDAwXCIsIFwiIzAwYmNmZlwiLCBcIiNmZmJjMDBcIiwgXCIjMDA4MDAwXCJdO1xuXG5jb25zdCBzZXJ2ZXIgPSBcIndzOi8vXCIgKyB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWUgKyBcIjo4MDgxXCI7XG5cbmNsYXNzIExvYmJ5IHtcblx0Y29uc3RydWN0b3IoY3R4KSB7XG5cdFx0dGhpcy5jdHggPSBjdHg7XG5cblx0XHR0aGlzLmFzc2V0cyA9IHtcblx0XHRcdGhleGFnb246IG5ldyBJbWFnZSgpLCBoZXhhZ29uczogW10sXG5cdFx0XHR0b3duOiBuZXcgSW1hZ2UoKSwgY2l0eTogbmV3IEltYWdlKCksIHRvd25zOiBbXSwgY2l0aWVzOiBbXSxcblx0XHRcdHBhd246IG5ldyBJbWFnZSgpLFxuXHRcdFx0b3JlX3NtOiBuZXcgSW1hZ2UoKSxcblx0XHRcdGxvZ3Nfc206IG5ldyBJbWFnZSgpLFxuXHRcdFx0Z3JhaW5fc206IG5ldyBJbWFnZSgpLFxuXHRcdFx0d29vbF9zbTogbmV3IEltYWdlKCksXG5cdFx0XHRicmlja3Nfc206IG5ldyBJbWFnZSgpLFxuXHRcdFx0eWVhcm9mcGxlbnR5OiBuZXcgSW1hZ2UoKSxcblx0XHRcdHZpY3Rvcnlwb2ludDogbmV3IEltYWdlKCksXG5cdFx0XHRyb2FkYnVpbGRpbmc6IG5ldyBJbWFnZSgpLFxuXHRcdFx0bW9ub3BvbHk6IG5ldyBJbWFnZSgpLFxuXHRcdFx0c29sZGllcjogbmV3IEltYWdlKCksXG5cdFx0XHRkaWNlOiBuZXcgSW1hZ2UoKSxcblx0XHRcdFxuXHRcdH07XG5cdFx0dGhpcy5hc3NldHMuaGV4YWdvbi5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCAoKSA9PiB7XG5cdFx0XHR0aWxlQ29sb3JzLmZvckVhY2goKGNvbG9yLCBpKSA9PiB7XG5cdFx0XHRcdHRoaXMuYXNzZXRzLmhleGFnb25zW2ldID0gYmxlbmQodGhpcy5hc3NldHMuaGV4YWdvbiwgY29sb3IpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5hc3NldHMudG93bi5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCAoKSA9PiB7XG5cdFx0XHRwbGF5ZXJDb2xvcnMuZm9yRWFjaCgoY29sb3IsIGkpID0+IHtcblx0XHRcdFx0dGhpcy5hc3NldHMudG93bnNbaV0gPSBibGVuZCh0aGlzLmFzc2V0cy50b3duLCBjb2xvcik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0aGlzLmFzc2V0cy5jaXR5LmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsICgpID0+IHtcblx0XHRcdHBsYXllckNvbG9ycy5mb3JFYWNoKChjb2xvciwgaSkgPT4ge1xuXHRcdFx0XHR0aGlzLmFzc2V0cy5jaXRpZXNbaV0gPSBibGVuZCh0aGlzLmFzc2V0cy5jaXR5LCBjb2xvcik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGJsZW5kKGltYWdlLCBjb2xvcikge1xuXHRcdFx0bGV0IGJsZW5kQ2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImNhbnZhc1wiKTtcblx0XHRcdGxldCBibGVuZEN0eCA9IGJsZW5kQ2FudmFzLmdldENvbnRleHQoXCIyZFwiKTtcblxuXHRcdFx0YmxlbmRDYW52YXMud2lkdGggPSBpbWFnZS53aWR0aDtcblx0XHRcdGJsZW5kQ2FudmFzLmhlaWdodCA9IGltYWdlLmhlaWdodDtcblxuXHRcdFx0YmxlbmRDdHguZmlsbFN0eWxlID0gY29sb3I7XG5cdFx0XHRibGVuZEN0eC5maWxsUmVjdCgwLCAwLCBibGVuZENhbnZhcy53aWR0aCwgYmxlbmRDYW52YXMuaGVpZ2h0KTtcblxuXHRcdFx0YmxlbmRDdHguZ2xvYmFsQ29tcG9zaXRlT3BlcmF0aW9uID0gXCJtdWx0aXBseVwiO1xuXHRcdFx0YmxlbmRDdHguZHJhd0ltYWdlKGltYWdlLCAwLCAwKTtcblxuXHRcdFx0YmxlbmRDdHguZ2xvYmFsQ29tcG9zaXRlT3BlcmF0aW9uID0gXCJkZXN0aW5hdGlvbi1hdG9wXCI7XG5cdFx0XHRibGVuZEN0eC5kcmF3SW1hZ2UoaW1hZ2UsIDAsIDApO1xuXG5cdFx0XHRyZXR1cm4gYmxlbmRDYW52YXM7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgYXNzZXQgaW4gdGhpcy5hc3NldHMpIHtcblx0XHRcdHRoaXMuYXNzZXRzW2Fzc2V0XS5zcmMgPSBcImFzc2V0cy9cIiArIGFzc2V0ICsgXCIucG5nXCI7XG5cdFx0fVxuXG5cdFx0dGhpcy53cyA9IG5ldyBXZWJTb2NrZXQoc2VydmVyKTtcblx0XHR0aGlzLndzLm9ubWVzc2FnZSA9IChldmVudCkgPT4ge1xuXHRcdFx0Y29uc29sZS5sb2coZXZlbnQuZGF0YSk7XG5cblx0XHRcdGxldCBtZXNzYWdlID0gSlNPTi5wYXJzZShldmVudC5kYXRhKTtcblx0XHRcdHN3aXRjaCAobWVzc2FnZS5tZXNzYWdlKSB7XG5cdFx0XHRjYXNlIFwic3RhcnRcIjpcblx0XHRcdFx0dGhpcy5ib2FyZCA9IG5ldyBDYXRhbihtZXNzYWdlLmJvYXJkKTtcblx0XHRcdFx0dGhpcy5wbGF5ZXIgPSBtZXNzYWdlLnBsYXllcjtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgXCJ0dXJuXCI6XG5cdFx0XHRcdHRoaXMudHVybiA9IG1lc3NhZ2UucGxheWVyO1xuXHRcdFx0XHRjdXJyZW50U3RhdGUgPSBuZXcgUGxheShcblx0XHRcdFx0XHR0aGlzLmN0eCwgdGhpcy5hc3NldHMsIHRoaXMud3MsXG5cdFx0XHRcdFx0dGhpcy5ib2FyZCwgdGhpcy5wbGF5ZXIsIHRoaXMudHVyblxuXHRcdFx0XHQpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBcImVuZFwiOlxuXHRcdFx0XHRjdXJyZW50U3RhdGUgPSBuZXcgTG9iYnkoY3R4KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGRyYXcoKSB7XG5cdFx0bGV0IGN0eCA9IHRoaXMuY3R4LCB3aWR0aCA9IGN0eC5jYW52YXMuY2xpZW50V2lkdGgsIGhlaWdodCA9IGN0eC5jYW52YXMuY2xpZW50SGVpZ2h0O1xuXG5cdFx0Y3R4LmZpbGxTdHlsZSA9IFwiIzAwMFwiO1xuXHRcdGN0eC5maWxsUmVjdCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcblxuXHRcdGN0eC5mb250ID0gXCI0OHB4IHNhbnMtc2VyaWZcIjtcblx0XHRjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcblx0XHRjdHgudGV4dEJhc2VsaW5lID0gXCJtaWRkbGVcIjtcblx0XHRjdHguZmlsbFN0eWxlID0gXCIjZmZmXCI7XG5cdFx0Y3R4LmZpbGxUZXh0KFwiRXNwZXJhbmRvIEp1Z2Fkb3Jlc1wiLCB3aWR0aCAvIDIsIGhlaWdodCAvIDIpO1xuXHR9XG59XG5cbmNsYXNzIFBsYXkge1xuXHRjb25zdHJ1Y3RvcihjdHgsIGFzc2V0cywgd3MsIGJvYXJkLCBwbGF5ZXIsIHR1cm4pIHtcblx0XHR0aGlzLmN0eCA9IGN0eDtcblx0XHR0aGlzLmFzc2V0cyA9IGFzc2V0cztcblx0XHR0aGlzLndzID0gd3M7XG5cblx0XHR0aGlzLmJvYXJkID0gYm9hcmQ7XG5cdFx0dGhpcy5oYW5kID0gbmV3IFBsYXllcigpO1xuXHRcdHRoaXMucGxheWVyID0gcGxheWVyO1xuXHRcdHRoaXMudHVybiA9IHR1cm47XG5cblx0XHR0aGlzLnByZWdhbWUgPSB0cnVlO1xuXHRcdHRoaXMubGFzdFRvd24gPSBbXTtcblxuXHRcdHRoaXMuc3ByaXRlcyA9IFtdO1xuXG5cdFx0dGhpcy50cmFkaW5nT2ZmZXJzID0gW107XG5cdFx0dGhpcy50cmFkaW5nT25nb2luZyA9IGZhbHNlO1xuXG5cdFx0dGhpcy5yb2JiZXIgPSB0aGlzLmJvYXJkLnJvYmJlcjtcblxuXHRcdHRoaXMubW91c2UgPSBbMCwgMF07XG5cdFx0dGhpcy50aWxlID0gWzAsIDBdO1xuXHRcdHRoaXMudmVydGV4ID0gWzAsIDAsIDBdO1xuXHRcdHRoaXMuZWRnZSA9IFswLCAwLCAwXTtcblxuXHRcdHRoaXMuY2FyZHMgPSBbXTtcblx0XHRsZXQgY2FyZFdpZHRoID0gdGhpcy5hc3NldHMuc29sZGllci53aWR0aCAqIDAuODtcblx0XHRsZXQgY2FyZEhlaWdodCA9IHRoaXMuYXNzZXRzLnNvbGRpZXIuaGVpZ2h0ICogMC44O1xuXHRcdGZvciAobGV0IGNhcmQgaW4gdGhpcy5oYW5kLmNhcmRzKSB7XG5cdFx0XHRsZXQgb2RkID0gY2FyZCAlIDIgPT0gMTtcblx0XHRcdGxldCBzcHJpdGUgPSBuZXcgRGV2ZWxvcG1lbnRDYXJkKFtcblx0XHRcdFx0Y2FudmFzLndpZHRoIC8gMiArIDQwICsgY2FyZCAqIChjYXJkV2lkdGggKyAxMCkgLyAyLFxuXHRcdFx0XHRjYW52YXMuaGVpZ2h0IC8gMiArIDMwICsgb2RkICogKGNhcmRIZWlnaHQgKyAzMClcblx0XHRcdF0sIFtjYXJkV2lkdGgsIGNhcmRIZWlnaHRdKTtcblx0XHRcdHRoaXMuY2FyZHNbK2NhcmRdID0gc3ByaXRlO1xuXHRcdH1cblx0XHRcblx0XHR0aGlzLmxvbmdlc3RSb2FkID0gbnVsbDtcblx0XHR0aGlzLmxvbmdlc3RSb2FkUGxheWVyID0gbnVsbDtcblx0XHR0aGlzLmxhcmdlc3RBcm15ID0gbnVsbDtcblx0XHR0aGlzLmxhcmdlc3RBcm15UGxheWVyID0gbnVsbDtcblxuXHRcdHRoaXMud3Mub25tZXNzYWdlID0gKGV2ZW50KSA9PiB7XG5cdFx0XHRjb25zb2xlLmxvZyhldmVudC5kYXRhKTtcblxuXHRcdFx0bGV0IG1lc3NhZ2UgPSBKU09OLnBhcnNlKGV2ZW50LmRhdGEpO1xuXHRcdFx0c3dpdGNoIChtZXNzYWdlLm1lc3NhZ2UpIHtcblx0XHRcdFxuXG5cdFx0XHRjYXNlIFwidHVyblwiOlxuXHRcdFx0XHR0aGlzLnR1cm4gPSBtZXNzYWdlLnBsYXllcjtcblx0XHRcdFx0dGhpcy5kaWNlID0gbWVzc2FnZS5kaWNlO1xuXHRcdFx0XHRpZiAobWVzc2FnZS5kaWUxICYmIG1lc3NhZ2UuZGllMikge1xuXHRcdFx0XHRcdGRpZTEuc3RhcnQobWVzc2FnZS5kaWUxKTtcblx0XHRcdFx0XHRkaWUyLnN0YXJ0KG1lc3NhZ2UuZGllMik7XG5cdFx0XHRcdH1cblx0XHRcdFx0XG5cdFx0XHRcdGlmIChtZXNzYWdlLnN0YXJ0KSB7XG5cdFx0XHRcdFx0dGhpcy5wcmVnYW1lID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5sYXN0VG93biA9IFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF0aGlzLmRpY2UpIHsgYnJlYWs7IH1cblx0XHRcdFx0aWYgKHRoaXMuZGljZSA9PSA3KSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMucGxheWVyID09IG1lc3NhZ2UucGxheWVyKSB7IHRoaXMuYWN0aW9uID0gXCJtb3ZlUm9iYmVyXCI7IH1cblxuXHRcdFx0XHRcdGxldCB0b3RhbCA9IFBsYXllci5jb3VudFJlc291cmNlcyh0aGlzLmhhbmQucmVzb3VyY2VzKTtcblx0XHRcdFx0XHRpZiAodG90YWwgPiA3KSB7IHNob3dEaXNjYXJkTW9kYWwoTWF0aC5mbG9vcih0b3RhbCAvIDIpKTsgfVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChsZXQgW2h4LCBoeV0gb2YgdGhpcy5ib2FyZC5oaXRbdGhpcy5kaWNlXSkge1xuXHRcdFx0XHRcdGxldCByZXNvdXJjZSA9IHRoaXMuYm9hcmQudGlsZXNbaHldW2h4XTtcblx0XHRcdFx0XHRsZXQgW3RweCwgdHB5XSA9IEhleC50aWxlVG9QaXhlbHMoaHgsIGh5KTtcblx0XHRcdFx0XHRmb3IgKGxldCBbY3gsIGN5LCBjZF0gb2YgdGhpcy5ib2FyZC5jb3JuZXJWZXJ0aWNlcyhoeCwgaHkpKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuYm9hcmQuYnVpbGRpbmdzW2N5XVtjeF1bY2RdKSB7IGNvbnRpbnVlOyB9XG5cblx0XHRcdFx0XHRcdGxldCBbdnB4LCB2cHldID0gSGV4LnZlcnRleFRvUGl4ZWxzKGN4LCBjeSwgY2QpO1xuXHRcdFx0XHRcdFx0dGhpcy5zcHJpdGVzLnB1c2gobmV3IFJlc291cmNlU3ByaXRlKHJlc291cmNlLCBbdHB4LCB0cHldLCBbdnB4LCB2cHldKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIFwicmVzb3VyY2VzXCI6XG5cdFx0XHRcdHRoaXMuaGFuZC5yZXNvdXJjZXMgPSBtZXNzYWdlLnJlc291cmNlcztcblx0XHRcdFx0dGhpcy5oYW5kLnBpZWNlcyA9IG1lc3NhZ2UucGllY2VzO1xuXHRcdFx0XHR0aGlzLmhhbmQuY2FyZHMgPSBtZXNzYWdlLmNhcmRzO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBcImJ1aWxkXCI6XG5cdFx0XHRcdGlmICh0aGlzLnByZWdhbWUgJiYgbWVzc2FnZS50eXBlID09IENhdGFuLlRPV04pIHtcblx0XHRcdFx0XHR0aGlzLmxhc3RUb3duW21lc3NhZ2UucGxheWVyXSA9IHsgeDogbWVzc2FnZS54LCB5OiBtZXNzYWdlLnksIGQ6IG1lc3NhZ2UuZCB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMucGVuZGluZ0NpdHkpIHsgZGVsZXRlIHRoaXMucGVuZGluZ0NpdHk7IH1cblx0XHRcdFx0dGhpcy5ib2FyZC5idWlsZChcblx0XHRcdFx0XHRtZXNzYWdlLnR5cGUsIG1lc3NhZ2UueCwgbWVzc2FnZS55LCBtZXNzYWdlLmQsIG1lc3NhZ2UucGxheWVyLFxuXHRcdFx0XHRcdHRoaXMucHJlZ2FtZSwgdGhpcy5sYXN0VG93blttZXNzYWdlLnBsYXllcl1cblx0XHRcdFx0KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgXCJjaGF0XCI6XG5cdFx0XHRcdGxldCBuYW1lU3BhbiwgY29udGVudFNwYW47XG5cdFx0XHRcdGlmIChtZXNzYWdlLnNlbmRlciA+IC0xKSB7XG5cdFx0XHRcdFx0bGV0IG5hbWUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIkp1Z2Fkb3IgXCIgKyBtZXNzYWdlLnNlbmRlciArIFwiOiBcIik7XG5cdFx0XHRcdFx0bmFtZVNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtcblx0XHRcdFx0XHRuYW1lU3Bhbi5zdHlsZS5jb2xvciA9IHBsYXllckNvbG9yc1ttZXNzYWdlLnNlbmRlcl07XG5cdFx0XHRcdFx0bmFtZVNwYW4uYXBwZW5kQ2hpbGQobmFtZSk7XG5cblx0XHRcdFx0XHRjb250ZW50U3BhbiA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKG1lc3NhZ2UudGV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmFtZVNwYW4gPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblxuXHRcdFx0XHRcdGxldCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobWVzc2FnZS50ZXh0KTtcblx0XHRcdFx0XHRjb250ZW50U3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpO1xuXHRcdFx0XHRcdGNvbnRlbnRTcGFuLnN0eWxlLmZvbnRXZWlnaHQgPSBcImJvbGRcIjtcblx0XHRcdFx0XHRjb250ZW50U3Bhbi5hcHBlbmRDaGlsZChjb250ZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBtc2dQID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG5cdFx0XHRcdG1zZ1AuYXBwZW5kQ2hpbGQobmFtZVNwYW4pO1xuXHRcdFx0XHRtc2dQLmFwcGVuZENoaWxkKGNvbnRlbnRTcGFuKTtcblxuXHRcdFx0XHRsZXQgY2hhdEJveCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2hhdC1jb250ZW50c1wiKTtcblx0XHRcdFx0Y2hhdEJveC5hcHBlbmRDaGlsZChtc2dQKTtcblx0XHRcdFx0Y2hhdEJveC5zY3JvbGxUb3AgPSBjaGF0Qm94LnNjcm9sbEhlaWdodDtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgXCJlbmRcIjpcblx0XHRcdFx0Y3VycmVudFN0YXRlID0gbmV3IExvYmJ5KGN0eCk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcblxuXHRcdFx0Y2FzZSBcIm9mZmVyXCI6XG5cdFx0XHRcdHRoaXMudHJhZGluZ09uZ29pbmcgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnRyYWRpbmdPZmZlcnNbbWVzc2FnZS5wbGF5ZXJdID0gbWVzc2FnZS5vZmZlcjtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgXCJjb25maXJtXCI6XG5cdFx0XHRcdHRoaXMudHJhZGluZ09uZ29pbmcgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy50cmFkaW5nT2ZmZXJzID0gW107XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcblxuXHRcdFx0Y2FzZSBcImRpc2NhcmRcIjpcblx0XHRcdFx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkaXNjYXJkLW1vZGFsXCIpLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgXCJyb2JiZXJcIjpcblx0XHRcdFx0dGhpcy5ib2FyZC5yb2JiZXIgPSBbbWVzc2FnZS54LCBtZXNzYWdlLnldO1xuXHRcdFx0XHRpZiAodGhpcy5hY3Rpb24gPT0gXCJzdGVhbFwiKSB7IGRlbGV0ZSB0aGlzLmFjdGlvbjsgfVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBcImVycm9yXCI6XG5cdFx0XHRcdGlmIChtZXNzYWdlLmVycm9yID09IFwicm9iYmVyXCIgJiYgdGhpcy5hY3Rpb24gPT0gXCJzdGVhbFwiKSB7XG5cdFx0XHRcdFx0dGhpcy5hY3Rpb24gPSBcIm1vdmVSb2JiZXJcIjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRtZXNzYWdlLmVycm9yID09IFwiZGV2ZWxvcFwiICYmXG5cdFx0XHRcdFx0KHRoaXMuYWN0aW9uID09IFwibW92ZVJvYmJlclwiIHx8IHRoaXMuYWN0aW9uID09IFwic3RlYWxcIilcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHRoaXMucm9iYmVyO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLmFjdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdFxuXHRcdFx0Y2FzZSBcInN0YXRzXCI6XG5cdFx0XHRcdHRoaXMubG9uZ2VzdFJvYWQgPSBtZXNzYWdlLmxvbmdlc3RSb2FkO1xuXHRcdFx0XHR0aGlzLmxvbmdlc3RSb2FkUGxheWVyID0gbWVzc2FnZS5sb25nZXN0Um9hZFBsYXllcjtcblx0XHRcdFx0dGhpcy5sYXJnZXN0QXJteSA9IG1lc3NhZ2UubGFyZ2VzdEFybXk7XG5cdFx0XHRcdHRoaXMubGFyZ2VzdEFybXlQbGF5ZXIgPSBtZXNzYWdlLmxhcmdlc3RBcm15UGxheWVyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0ZHJhdygpIHtcblx0XHRsZXQgY3R4ID0gdGhpcy5jdHgsIHdpZHRoID0gY3R4LmNhbnZhcy5jbGllbnRXaWR0aCwgaGVpZ2h0ID0gY3R4LmNhbnZhcy5jbGllbnRIZWlnaHQ7XG5cblx0XHRjdHguZmlsbFN0eWxlID0gXCIjMDAwXCI7XG5cdFx0Y3R4LmZpbGxSZWN0KDAsIDAsIHdpZHRoLCBoZWlnaHQpO1xuXG5cdFx0Y3R4LmZvbnQgPSBcIjE0cHggc2Fucy1zZXJpZlwiO1xuXHRcdGN0eC50ZXh0QWxpZ24gPSBcImxlZnRcIjtcblx0XHRjdHgudGV4dEJhc2VsaW5lID0gXCJ0b3BcIjtcblx0XHRjdHguZmlsbFN0eWxlID0gXCIjZmZmXCI7XG5cdFx0Y3R4LmZpbGxUZXh0KFwidHUgZXJlcyBlbCBqdWdhZG9yICBcIiArIHRoaXMucGxheWVyICsgXCIgeSBlcyB0dXJubyBkZWwganVnYWRvciAgXCIgKyB0aGlzLnR1cm4gKyBcIiBcIiwgMCwgMCk7XG5cblx0XHRsZXQgW214LCBteV0gPSB0aGlzLnRpbGUsIFttdngsIG12eSwgbXZkXSA9IHRoaXMudmVydGV4LCBbbWV4LCBtZXksIG1lZF0gPSB0aGlzLmVkZ2U7XG5cdFx0aWYgKGZhbHNlKSB7XG5cdFx0XHRjdHguZmlsbFRleHQoXCJNb3VzZSBjdXJzb3Igb24gdGlsZSAoXCIgKyBteCArIFwiLFwiICsgbXkgKyBcIilcIiwgMCwgMTYpO1xuXHRcdFx0Y3R4LmZpbGxUZXh0KFwiTW91c2UgY3Vyc29yIG5lYXIgdmVydGV4IChcIiArIG12eCArIFwiLFwiICsgbXZ5ICsgXCIsXCIgKyBbXCJMXCIsIFwiUlwiXVttdmRdICsgXCIpXCIsIDAsIDMyKTtcblx0XHRcdGN0eC5maWxsVGV4dChcIk1vdXNlIGN1cnNvciBuZWFyIGVkZ2UgKFwiICsgbWV4ICsgXCIsXCIgKyBtZXkgKyBcIixcIiArIFtcIldcIiwgXCJOXCIsIFwiRVwiXVttZWRdICsgXCIpXCIsIDAsIDQ4KTtcblx0XHR9XG5cblx0XHRsZXQgY3ggPSAzLCBjeSA9IDMsIE4gPSAzO1xuXG5cdFx0XG5cdFx0dGhpcy5ib2FyZC5mb3JFYWNoVGlsZShjeCwgY3ksIE4sICh4LCB5KSA9PiB7XG5cdFx0XHRsZXQgW3B4LCBweV0gPSBIZXgudGlsZVRvUGl4ZWxzKHgsIHkpO1xuXG5cdFx0XHRsZXQgaW1hZ2UgPSB0aGlzLmFzc2V0cy5oZXhhZ29uc1t0aGlzLmJvYXJkLnRpbGVzW3ldW3hdXSB8fCB0aGlzLmFzc2V0cy5oZXhhZ29uO1xuXHRcdFx0bGV0IHdpZHRoID0gMiAqIEhleC5yYWRpdXMgLSA1LCBoZWlnaHQgPSAyICogSGV4LnJhZGl1cyAqIE1hdGguc2luKE1hdGguUEkgLyAzKSAtIDU7XG5cdFx0XHRjdHguZHJhd0ltYWdlKGltYWdlLCBweCAtIHdpZHRoIC8gMiwgcHkgLSBoZWlnaHQgLyAyLCB3aWR0aCwgaGVpZ2h0KTtcblx0XHR9KTtcblxuXHRcdFxuXHRcdHRoaXMuYm9hcmQuZm9yRWFjaFRpbGUoY3gsIGN5LCBOLCAoeCwgeSkgPT4ge1xuXHRcdFx0Zm9yIChsZXQgZCA9IDA7IGQgPCAzOyBkKyspIHtcblx0XHRcdFx0bGV0IHJvYWQgPSB0aGlzLmJvYXJkLnJvYWRzW3ldW3hdW2RdO1xuXHRcdFx0XHRpZiAocm9hZCA9PSBudWxsKSB7IGNvbnRpbnVlOyB9XG5cblx0XHRcdFx0ZHJhd1JvYWQocGxheWVyQ29sb3JzW3JvYWRdLCB4LCB5LCBkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChcblx0XHRcdHRoaXMuYWN0aW9uID09IFwiYnVpbGRSb2FkXCIgJiZcblx0XHRcdHRoaXMuYm9hcmQudmFsaWRSb2FkKG1leCwgbWV5LCBtZWQsIHRoaXMucGxheWVyLCB0aGlzLnByZWdhbWUsIHRoaXMubGFzdFRvd25bdGhpcy5wbGF5ZXJdKVxuXHRcdCkge1xuXHRcdFx0Y3R4Lmdsb2JhbEFscGhhID0gMC41O1xuXHRcdFx0ZHJhd1JvYWQocGxheWVyQ29sb3JzW3RoaXMucGxheWVyXSwgbWV4LCBtZXksIG1lZCk7XG5cdFx0XHRjdHguZ2xvYmFsQWxwaGEgPSAxLjA7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZHJhd1JvYWQoY29sb3IsIHgsIHksIGQpIHtcblx0XHRcdGxldCBbW3gxLCB5MSwgZDFdLCBbeDIsIHkyLCBkMl1dID0gY3VycmVudFN0YXRlLmJvYXJkLmVuZHBvaW50VmVydGljZXMoeCwgeSwgZCk7XG5cdFx0XHRsZXQgW3B4MSwgcHkxXSA9IEhleC52ZXJ0ZXhUb1BpeGVscyh4MSwgeTEsIGQxKTtcblx0XHRcdGxldCBbcHgyLCBweTJdID0gSGV4LnZlcnRleFRvUGl4ZWxzKHgyLCB5MiwgZDIpO1xuXG5cdFx0XHRjdHguc3Ryb2tlU3R5bGUgPSBjb2xvcjtcblx0XHRcdGN0eC5saW5lV2lkdGggPSA0O1xuXHRcdFx0Y3R4LmJlZ2luUGF0aCgpO1xuXHRcdFx0Y3R4Lm1vdmVUbyhweDEsIHB5MSk7XG5cdFx0XHRjdHgubGluZVRvKHB4MiwgcHkyKTtcblx0XHRcdGN0eC5zdHJva2UoKTtcblx0XHR9XG5cblx0XHRcblx0XHR0aGlzLmJvYXJkLmZvckVhY2hUaWxlKGN4LCBjeSwgTiwgKHgsIHkpID0+IHtcblx0XHRcdGZvciAobGV0IGQgPSAwOyBkIDwgMjsgZCsrKSB7XG5cdFx0XHRcdGxldCBidWlsZGluZyA9IHRoaXMuYm9hcmQuYnVpbGRpbmdzW3ldW3hdW2RdO1xuXHRcdFx0XHRpZiAoIWJ1aWxkaW5nKSB7IGNvbnRpbnVlOyB9XG5cblx0XHRcdFx0XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLmFjdGlvbiA9PSBcImJ1aWxkQ2l0eVwiICYmIHggPT0gbXZ4ICYmIHkgPT0gbXZ5ICYmIGQgPT0gbXZkICYmXG5cdFx0XHRcdFx0dGhpcy5ib2FyZC52YWxpZENpdHkoeCwgeSwgZClcblx0XHRcdFx0KSB7IGNvbnRpbnVlOyB9XG5cblx0XHRcdFx0bGV0IGltYWdlO1xuXHRcdFx0XHRzd2l0Y2ggKGJ1aWxkaW5nLnR5cGUpIHtcblx0XHRcdFx0Y2FzZSBDYXRhbi5UT1dOOiBpbWFnZSA9IHRoaXMuYXNzZXRzLnRvd25zW2J1aWxkaW5nLnBsYXllcl07IGJyZWFrO1xuXHRcdFx0XHRjYXNlIENhdGFuLkNJVFk6IGltYWdlID0gdGhpcy5hc3NldHMuY2l0aWVzW2J1aWxkaW5nLnBsYXllcl07IGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0XG5cdFx0XHRcdGxldCBwZW5kaW5nID0gdGhpcy5wZW5kaW5nQ2l0eTtcblx0XHRcdFx0aWYgKHBlbmRpbmcgJiYgcGVuZGluZy54ID09IHggJiYgcGVuZGluZy55ID09IHkgJiYgcGVuZGluZy5kID09IGQpIHtcblx0XHRcdFx0XHRpbWFnZSA9IHRoaXMuYXNzZXRzLmNpdGllc1tidWlsZGluZy5wbGF5ZXJdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZHJhd0J1aWxkaW5nKGltYWdlLCB4LCB5LCBkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLmFjdGlvbiA9PSBcImJ1aWxkVG93blwiICYmIHRoaXMuYm9hcmQudmFsaWRUb3duKG12eCwgbXZ5LCBtdmQpKSB7XG5cdFx0XHRjdHguZ2xvYmFsQWxwaGEgPSAwLjU7XG5cdFx0XHRkcmF3QnVpbGRpbmcodGhpcy5hc3NldHMudG93bnNbdGhpcy5wbGF5ZXJdLCBtdngsIG12eSwgbXZkKTtcblx0XHRcdGN0eC5nbG9iYWxBbHBoYSA9IDEuMDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY3Rpb24gPT0gXCJidWlsZENpdHlcIiAmJiB0aGlzLmJvYXJkLnZhbGlkQ2l0eShtdngsIG12eSwgbXZkKSkge1xuXHRcdFx0Y3R4Lmdsb2JhbEFscGhhID0gMC41O1xuXHRcdFx0ZHJhd0J1aWxkaW5nKHRoaXMuYXNzZXRzLmNpdGllc1t0aGlzLnBsYXllcl0sIG12eCwgbXZ5LCBtdmQpO1xuXHRcdFx0Y3R4Lmdsb2JhbEFscGhhID0gMS4wO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGRyYXdCdWlsZGluZyhpbWFnZSwgeCwgeSwgZCkge1xuXHRcdFx0bGV0IFtweCwgcHldID0gSGV4LnZlcnRleFRvUGl4ZWxzKHgsIHksIGQpO1xuXHRcdFx0Y3R4LmRyYXdJbWFnZShpbWFnZSwgcHggLSBpbWFnZS53aWR0aCAvIDIsIHB5IC0gaW1hZ2UuaGVpZ2h0IC8gMik7XG5cdFx0fVxuXG5cdFx0XG5cdFx0dGhpcy5ib2FyZC5oaXQuZm9yRWFjaCgoaGl0LCBpKSA9PiB7XG5cdFx0XHRpZiAoaGl0ID09IG51bGwgfHwgaSA9PSAwKSB7IHJldHVybjsgfVxuXG5cdFx0XHRjdHguZm9udCA9IFwiMTZweCBzYW5zLXNlcmlmXCI7XG5cdFx0XHRjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcblx0XHRcdGN0eC50ZXh0QmFzZWxpbmUgPSBcIm1pZGRsZVwiO1xuXHRcdFx0Y3R4LmZpbGxTdHlsZSA9IFwiMHhmZmZcIjtcblx0XHRcdGZvciAobGV0IFt4LCB5XSBvZiBoaXQpIHtcblx0XHRcdFx0bGV0IFtweCwgcHldID0gSGV4LnRpbGVUb1BpeGVscyh4LCB5KTtcblxuXHRcdFx0XHRjdHguZmlsbFRleHQoaSwgcHgsIHB5IC0gMTApO1xuXHRcdFx0XHRjdHguZmlsbFRleHQoZ2V0UGlwcyhpKSwgcHgsIHB5KyAxMCk7XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGdldFBpcHMoaSkge1xuXHRcdFx0XHRzd2l0Y2ggKGkpIHtcblx0XHRcdFx0Y2FzZSAyOiBjYXNlIDEyOiByZXR1cm4gXCLigKJcIjtcblx0XHRcdFx0Y2FzZSAzOiBjYXNlIDExOiByZXR1cm4gXCLigKLigKJcIjtcblx0XHRcdFx0Y2FzZSA0OiBjYXNlIDEwOiByZXR1cm4gXCLigKLigKLigKJcIjtcblx0XHRcdFx0Y2FzZSA1OiBjYXNlIDk6IHJldHVybiBcIuKAouKAouKAouKAolwiO1xuXHRcdFx0XHRjYXNlIDY6IGNhc2UgODogcmV0dXJuIFwi4oCi4oCi4oCi4oCi4oCiXCI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdFxuXHRcdGZvciAobGV0IGkgPSB0aGlzLnNwcml0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGxldCBzcHJpdGUgPSB0aGlzLnNwcml0ZXNbaV07XG5cdFx0XHRpZiAoc3ByaXRlLm1vdmUoKSkgeyB0aGlzLnNwcml0ZXMuc3BsaWNlKGksIDEpOyB9XG5cblx0XHRcdGxldCBpbWFnZTtcblx0XHRcdHN3aXRjaCAoc3ByaXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgQ2F0YW4uT1JFOiBpbWFnZSA9IHRoaXMuYXNzZXRzLm9yZV9zbTsgYnJlYWs7XG5cdFx0XHRjYXNlIENhdGFuLldPT0Q6IGltYWdlID0gdGhpcy5hc3NldHMubG9nc19zbTsgYnJlYWs7XG5cdFx0XHRjYXNlIENhdGFuLldPT0w6IGltYWdlID0gdGhpcy5hc3NldHMud29vbF9zbTsgYnJlYWs7XG5cdFx0XHRjYXNlIENhdGFuLkdSQUlOOiBpbWFnZSA9IHRoaXMuYXNzZXRzLmdyYWluX3NtOyBicmVhaztcblx0XHRcdGNhc2UgQ2F0YW4uQlJJQ0s6IGltYWdlID0gdGhpcy5hc3NldHMuYnJpY2tzX3NtOyBicmVhaztcblx0XHRcdH1cblxuXHRcdFx0bGV0IFt4LCB5XSA9IHNwcml0ZS5wb3MsIHNjYWxlID0gc3ByaXRlLnNjYWxlO1xuXHRcdFx0Y3R4LmRyYXdJbWFnZShcblx0XHRcdFx0aW1hZ2UsXG5cdFx0XHRcdHggLSBzY2FsZSAqIGltYWdlLndpZHRoIC8gMiwgeSAtIHNjYWxlICogaW1hZ2UuaGVpZ2h0IC8gMixcblx0XHRcdFx0c2NhbGUgKiBpbWFnZS53aWR0aCwgc2NhbGUgKiBpbWFnZS5oZWlnaHRcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0XG5cdFx0aWYgKHRoaXMuYWN0aW9uICE9IFwibW92ZVJvYmJlclwiKSB7XG5cdFx0XHRsZXQgW3J4LCByeV0gPSB0aGlzLmFjdGlvbiA9PSBcInN0ZWFsXCIgPyB0aGlzLnJvYmJlciA6IHRoaXMuYm9hcmQucm9iYmVyO1xuXHRcdFx0ZHJhd1JvYmJlcih0aGlzLmFzc2V0cy5wYXduLCByeCwgcnkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5ib2FyZC5pc0dyb3VuZChteCwgbXkpKSB7XG5cdFx0XHRjdHguZ2xvYmFsQWxwaGEgPSAwLjU7XG5cdFx0XHRkcmF3Um9iYmVyKHRoaXMuYXNzZXRzLnBhd24sIG14LCBteSk7XG5cdFx0XHRjdHguZ2xvYmFsQWxwaGEgPSAxLjA7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZHJhd1JvYmJlcihpbWFnZSwgeCwgeSkge1xuXHRcdFx0bGV0IFtweCwgcHldID0gSGV4LnRpbGVUb1BpeGVscyh4LCB5KTtcblx0XHRcdGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHB4IC0gaW1hZ2Uud2lkdGggLyAyLCBweSAtIGltYWdlLmhlaWdodCAvIDIpO1xuXHRcdH1cblxuXHRcdFxuXHRcdHtcblx0XHRcdGN0eC5mb250ID0gXCIxNHB4IHNhbnMtc2VyaWZcIjtcblx0XHRcdGN0eC50ZXh0QWxpZ24gPSBcImxlZnRcIjtcblx0XHRcdGN0eC50ZXh0QmFzZWxpbmUgPSBcInRvcFwiO1xuXHRcdFx0Y3R4LmZpbGxTdHlsZSA9IFwiI2ZmZlwiO1xuXG5cdFx0XHRmb3IgKGxldCBwaWVjZSBpbiB0aGlzLmhhbmQucGllY2VzKSB7XG5cdFx0XHRcdGxldCB5ID0gcGllY2UgKiAxNjtcblx0XHRcdFx0Y3R4LmZpbGxUZXh0KFBsYXkucGllY2VOYW1lc1twaWVjZV0sIHdpZHRoIC8gMiArIDQwICsgMCwgeSk7XG5cdFx0XHRcdGN0eC5maWxsVGV4dCh0aGlzLmhhbmQucGllY2VzW3BpZWNlXSwgd2lkdGggLyAyICsgNDAgKyA1MCwgeSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IHJlc291cmNlIGluIHRoaXMuaGFuZC5yZXNvdXJjZXMpIHtcblx0XHRcdFx0bGV0IHkgPSAtMTYgKyByZXNvdXJjZSAqIDE2O1xuXHRcdFx0XHRjdHguZmlsbFRleHQoQ2F0YW4ucmVzb3VyY2VOYW1lc1tyZXNvdXJjZV0sIHdpZHRoIC8gMiArIDQwICsgOTAsIHkpO1xuXHRcdFx0XHRjdHguZmlsbFRleHQodGhpcy5oYW5kLnJlc291cmNlc1tyZXNvdXJjZV0sIHdpZHRoIC8gMiArIDQwICsgMTQwLCB5KTtcblx0XHRcdH1cblxuXHRcdFx0Y3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XG5cdFx0XHRmb3IgKGxldCBjYXJkIGluIHRoaXMuaGFuZC5jYXJkcykge1xuXHRcdFx0XHRjYXJkID0gK2NhcmQ7XG5cblx0XHRcdFx0bGV0IGltYWdlO1xuXHRcdFx0XHRzd2l0Y2ggKGNhcmQpIHtcblx0XHRcdFx0Y2FzZSBDYXRhbi5LTklHSFQ6IGltYWdlID0gdGhpcy5hc3NldHMuc29sZGllcjsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2F0YW4uTU9OT1BPTFk6IGltYWdlID0gdGhpcy5hc3NldHMubW9ub3BvbHk7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIENhdGFuLllFQVJfT0ZfUExFTlRZOiBpbWFnZSA9IHRoaXMuYXNzZXRzLnllYXJvZnBsZW50eTsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2F0YW4uVklDVE9SWV9QT0lOVDogaW1hZ2UgPSB0aGlzLmFzc2V0cy52aWN0b3J5cG9pbnQ7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIENhdGFuLlJPQURfQlVJTERJTkc6IGltYWdlID0gdGhpcy5hc3NldHMucm9hZGJ1aWxkaW5nOyBicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBbeCwgeV0gPSB0aGlzLmNhcmRzW2NhcmRdLnBvcztcblx0XHRcdFx0bGV0IHNjYWxlID0gdGhpcy5jYXJkc1tjYXJkXS5zY2FsZTtcblx0XHRcdFx0Y3R4LmRyYXdJbWFnZShpbWFnZSwgeCwgeSwgaW1hZ2Uud2lkdGggKiBzY2FsZSwgaW1hZ2UuaGVpZ2h0ICogc2NhbGUpO1xuXG5cdFx0XHRcdGxldCBbdHgsIHR5XSA9IFt4ICsgaW1hZ2Uud2lkdGggKiAwLjggLyAyLCB5ICsgaW1hZ2UuaGVpZ2h0ICogc2NhbGUgKyAxMF07XG5cdFx0XHRcdGN0eC5maWxsVGV4dChcInhcIiArIHRoaXMuaGFuZC5jYXJkc1tjYXJkXSwgdHgsIHR5KTtcblx0XHRcdH1cblx0XHRcdGN0eC50ZXh0QWxpZ24gPSBcImxlZnRcIjtcblxuXHRcdFx0aWYgKHRoaXMudHJhZGluZ09uZ29pbmcpIHtcblx0XHRcdFx0Y3R4LmZpbGxUZXh0KFwiT2ZmZXJzOlwiLCB3aWR0aCAvIDIgKyA0MCwgMTAwKTtcblxuXHRcdFx0XHRsZXQgaiA9IDA7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG5cdFx0XHRcdFx0bGV0IHR4LCB0eTtcblx0XHRcdFx0XHRpZiAoaSA9PSB0aGlzLnR1cm4pIHtcblx0XHRcdFx0XHRcdFt0eCwgdHldID0gW3dpZHRoIC8gMiArIDQwLCAxMzJdO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRbdHgsIHR5XSA9IFt3aWR0aCAvIDIgKyA0MCArIDEyMCAqIGosIDEzMiArIDE2ICogN107XG5cdFx0XHRcdFx0XHRqKys7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y3R4LmZpbGxUZXh0KFwiSnVnYWRvciBcIiArIGkgKyBcIjpcIiwgdHgsIHR5KTtcblx0XHRcdFx0XHRsZXQgb2ZmZXJUZXh0ID0gW107XG5cdFx0XHRcdFx0bGV0IG9mZmVyID0gdGhpcy50cmFkaW5nT2ZmZXJzW2ldO1xuXHRcdFx0XHRcdGZvciAobGV0IGtpbmQgaW4gb2ZmZXIpIHtcblx0XHRcdFx0XHRcdGlmICghb2ZmZXJba2luZF0pIHsgY29udGludWU7IH1cblx0XHRcdFx0XHRcdG9mZmVyVGV4dC5wdXNoKG9mZmVyW2tpbmRdICsgXCIgXCIgKyBDYXRhbi5yZXNvdXJjZU5hbWVzW2tpbmRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b2ZmZXJUZXh0LmZvckVhY2goKHRleHQsIHJvdykgPT4gY3R4LmZpbGxUZXh0KHRleHQsIHR4LCB0eSArIDE2ICogKHJvdyArIDEpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XHRcdFx0XG5cdFxuXHRcdFxuXHRcdGRpZTEuYWR2YW5jZSgpO1xuXHRcdGN0eC5kcmF3SW1hZ2UodGhpcy5hc3NldHMuZGljZSwgKGRpZTEuaW5kZXggLSAxKSpkaWUxLnNpemUgKyAxLCAxLCBkaWUxLnNpemUsIGRpZTEuc2l6ZSwgZGllMS5vZmZzZXRbMF0sIGRpZTEub2Zmc2V0WzFdLCBkaWUxLnNpemUgKiAwLjgsIGRpZTEuc2l6ZSAqIDAuOCk7XG5cdFx0ZGllMi5hZHZhbmNlKCk7XG5cdFx0Y3R4LmRyYXdJbWFnZSh0aGlzLmFzc2V0cy5kaWNlLCAoZGllMi5pbmRleCAtIDEpKmRpZTIuc2l6ZSArIDEsIDEsIGRpZTIuc2l6ZSwgZGllMi5zaXplLCBkaWUyLm9mZnNldFswXSwgZGllMi5vZmZzZXRbMV0sIGRpZTIuc2l6ZSAqIDAuOCwgZGllMi5zaXplICogMC44KTtcblx0fVxuXG5cdGNsaWNrKCkge1xuXHRcdGxldCBbdHgsIHR5XSA9IHRoaXMudGlsZTtcblx0XHRsZXQgW3Z4LCB2eSwgdmRdID0gdGhpcy52ZXJ0ZXg7XG5cdFx0bGV0IFtleCwgZXksIGVkXSA9IHRoaXMuZWRnZTtcblxuXHRcdGlmICh0aGlzLmFjdGlvbiA9PSBcIm1vdmVSb2JiZXJcIikge1xuXHRcdFx0Y3VycmVudFN0YXRlLnN0ZWFsKHR4LCB0eSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHR5cGUsIHgsIHksIGQ7XG5cdFx0c3dpdGNoICh0aGlzLmFjdGlvbikge1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuO1xuXG5cdFx0XHRjYXNlIFwiYnVpbGRSb2FkXCI6IHNlbmRCdWlsZCh0aGlzLndzLCBDYXRhbi5ST0FELCBleCwgZXksIGVkKTsgYnJlYWs7XG5cdFx0XHRjYXNlIFwiYnVpbGRUb3duXCI6IHNlbmRCdWlsZCh0aGlzLndzLCBDYXRhbi5UT1dOLCB2eCwgdnksIHZkKTsgYnJlYWs7XG5cdFx0XHRjYXNlIFwiYnVpbGRDaXR5XCI6IHNlbmRCdWlsZCh0aGlzLndzLCBDYXRhbi5DSVRZLCB2eCwgdnksIHZkKTsgYnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYWN0aW9uID09IFwiYnVpbGRDaXR5XCIpIHtcblx0XHRcdHRoaXMucGVuZGluZ0NpdHkgPSB7IHg6IHZ4LCB5OiB2eSwgZDogdmQgfTtcblx0XHR9XG5cblx0XHRyZXN0b3JlRGVmYXVsdEJ1dHRvbnMoKTtcblx0XHRkZWxldGUgdGhpcy5hY3Rpb247XG5cblx0XHRmdW5jdGlvbiBzZW5kQnVpbGQod3MsIHR5cGUsIHgsIHksIGQpIHtcblx0XHRcdHdzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiBcImJ1aWxkXCIsIHR5cGU6IHR5cGUsIHg6IHgsIHk6IHksIGQ6IGQgfSkpO1xuXHRcdH1cblx0fVxuXG5cdGJ1eURldmVsb3AoKSB7XG5cdFx0dGhpcy53cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogXCJDb21wcmEgRGVzYXJyb2xsb1wiIH0pKTtcblx0fVxuXG5cdG9mZmVyKG9mZmVyKSB7XG5cdFx0dGhpcy53cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogXCJvZmVydGFcIiwgb2ZmZXI6IG9mZmVyIH0pKTtcblx0fVxuXG5cdGNvbmZpcm0ocGxheWVyKSB7XG5cdFx0dGhpcy53cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogXCJjb25maXJtYXJcIiwgcGxheWVyOiBwbGF5ZXIgfSkpO1xuXHR9XG5cblx0Y2FuY2VsKCkge1xuXHRcdHRoaXMud3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2U6IFwiY2FuY2VsYXJcIiB9KSk7XG5cdH1cblxuXHRzdGVhbCh4LCB5KSB7XG5cdFx0dGhpcy5yb2JiZXIgPSBbeCwgeV07XG5cdFx0dGhpcy5hY3Rpb24gPSBcInN0ZWFsXCI7XG5cblx0XHRsZXQgdGFyZ2V0cyA9IHRoaXMuYm9hcmQucm9iYmVyVGFyZ2V0cyh4LCB5LCB0aGlzLnBsYXllcik7XG5cblx0XHRcblx0XHRpZiAodGFyZ2V0cy5sZW5ndGggPT0gMCkge1xuXHRcdFx0dGhpcy53cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogXCJyb2JiZXJcIiwgeDogeCwgeTogeSB9KSk7XG5cdFx0fVxuXG5cdFx0XG5cdFx0bGV0IGJ1dHRvbnMgPSBbXTtcblx0XHRmb3IgKGxldCB0YXJnZXQgb2YgdGFyZ2V0cykge1xuXHRcdFx0bGV0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG5cblx0XHRcdGJ1dHRvbnMucHVzaChidXR0b24pO1xuXHRcdFx0ZG9jdW1lbnQuZm9ybXMudHJhZGluZy5hcHBlbmRDaGlsZChidXR0b24pO1xuXG5cdFx0XHRidXR0b24uaW5uZXJIVE1MID0gXCJSb2JhciBhbCBqdWdhZG9yIFwiICsgdGFyZ2V0O1xuXHRcdFx0YnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHR0aGlzLndzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiBcInJvYmJlclwiLCB4OiB4LCB5OiB5LCBwbGF5ZXI6IHRhcmdldCB9KSk7XG5cdFx0XHRcdGJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uKSA9PiBkb2N1bWVudC5mb3Jtcy50cmFkaW5nLnJlbW92ZUNoaWxkKGJ1dHRvbikpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0ZW5kVHVybigpIHtcblx0XHR0aGlzLndzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiBcInR1cm5cIiB9KSk7XG5cdH1cblxuXHRwbGF5Um9hZEJ1aWxkaW5nKCkge1xuXHRcdHRoaXMud3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2U6IFwiZGV2ZWxvcFwiLCBjYXJkOiBDYXRhbi5ST0FEX0JVSUxESU5HIH0pKTtcblx0fVxuXG5cdHBsYXlZZWFyT2ZQbGVudHkoKSB7XG5cdFx0c2hvd1lvcE1vZGFsKCk7XG5cdH1cblxuXHRwbGF5S25pZ2h0KCkge1xuXHRcdHRoaXMud3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2U6IFwiZGV2ZWxvcFwiLCBjYXJkOiBDYXRhbi5LTklHSFQgfSkpO1xuXHRcdHRoaXMuYWN0aW9uID0gXCJtb3ZlUm9iYmVyXCI7XG5cdH1cblxuXHRwbGF5TW9ub3BvbHkoKSB7XG5cdFx0c2hvd01vbm9wb2x5TW9kYWwoKTtcblx0fVxufVxuXG5QbGF5LnBpZWNlTmFtZXMgPSB7XG5cdFtDYXRhbi5ST0FEXTogXCJDYXJyLlwiLFxuXHRbQ2F0YW4uVE9XTl06IFwiUHVlYmxvXCIsXG5cdFtDYXRhbi5DSVRZXTogXCJDaXVkYWRcIixcbn07XG5cblBsYXkuY2FyZE5hbWVzID0ge1xuXHRbQ2F0YW4uS05JR0hUXTogXCJDYWJhbGxlcm9cIixcblx0W0NhdGFuLllFQVJfT0ZfUExFTlRZXTogXCJBw7FvIGRlIGFidW5kYW5jaWFcIixcblx0W0NhdGFuLk1PTk9QT0xZXTogXCJNb25vcG9saW9cIixcblx0W0NhdGFuLlZJQ1RPUllfUE9JTlRdOiBcIlB1bnRvIGRlIFZpY3RvcmlhXCIsXG5cdFtDYXRhbi5ST0FEX0JVSUxESU5HXTogXCIyIGNhcnJldGVyYXNcIixcbn07XG5cblJlc291cmNlU3ByaXRlID0gY2xhc3Mge1xuXHRjb25zdHJ1Y3Rvcih0eXBlLCBzdGFydCwgZW5kKSB7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR0aGlzLnN0YXJ0ID0gc3RhcnQ7XG5cdFx0dGhpcy5lbmQgPSBlbmQ7XG5cblx0XHR0aGlzLmNvdW50ID0gMDtcblx0fVxuXG5cdG1vdmUoKSB7XG5cdFx0bGV0IHQgPSB0aGlzLmNvdW50IC8gOTA7XG5cdFx0dGhpcy5jb3VudCArPSAxO1xuXG5cdFx0dGhpcy5zY2FsZSA9IGxlcnAoMC41LCAxLCA0ICogdCk7XG5cdFx0dGhpcy5wb3MgPSBsZXJwMih0aGlzLnN0YXJ0LCB0aGlzLmVuZCwgMS41ICogdCAtIDAuNSk7XG5cblx0XHRyZXR1cm4gdCA+IDE7XG5cblx0XHRmdW5jdGlvbiBsZXJwKGEsIGIsIHQpIHtcblx0XHRcdHQgPSBNYXRoLm1pbihNYXRoLm1heCgwLCB0KSwgMSk7XG5cdFx0XHRyZXR1cm4gKDEgLSB0KSAqIGEgKyB0ICogYjtcblx0XHR9XG5cdFx0ZnVuY3Rpb24gbGVycDIoW2F4LCBheV0sIFtieCwgYnldLCB0KSB7IHJldHVybiBbbGVycChheCwgYngsIHQpLCBsZXJwKGF5LCBieSwgdCldOyB9XG5cdH1cbn07XG5cbkRldmVsb3BtZW50Q2FyZCA9IGNsYXNzIHtcblx0Y29uc3RydWN0b3IocG9zaXRpb24sIHNpemUpIHtcblx0XHR0aGlzLnBvcyA9IHBvc2l0aW9uO1xuXHRcdHRoaXMuc2l6ZSA9IHNpemU7XG5cdFx0dGhpcy5zY2FsZSA9IDAuODtcblx0fVxuXG5cdGluQ2FyZCh4LCB5KSB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHRoaXMucG9zWzBdIDw9IHggJiYgeCA8IHRoaXMucG9zWzBdICsgdGhpcy5zaXplWzBdICogdGhpcy5zY2FsZSAmJlxuXHRcdFx0dGhpcy5wb3NbMV0gPD0geSAmJiB5IDwgdGhpcy5wb3NbMV0gKyB0aGlzLnNpemVbMV0gKiB0aGlzLnNjYWxlXG5cdFx0KTtcblx0fVxufVxuXG5EaWNlU3ByaXRlID0gY2xhc3Mge1xuXHRcblx0Y29uc3RydWN0b3Ioc2l6ZSwgb2Zmc2V0KXtcblx0XHRcblx0XHRcblx0XHR0aGlzLmNvdW50ID0gNDg7XG5cdFx0XG5cdFx0XG5cdFx0dGhpcy5pbmRleCA9IDA7XG5cdFx0XG5cdFx0dGhpcy5zaXplID0gc2l6ZTtcblx0XHR0aGlzLm9mZnNldCA9IG9mZnNldDtcblx0XHRcblx0XHRcblx0XHR0aGlzLnRhcmdldCA9IDA7XG5cdH1cbiBcblx0c3RhcnQodGFyZ2V0KXtcblx0XHR0aGlzLmNvdW50ID0gMDtcblx0XHR0aGlzLnRhcmdldCA9IHRhcmdldDtcblx0fVxuXHRcbiBcblx0YWR2YW5jZSgpe1xuXHRcdGlmKHRoaXMuY291bnQgPCA0OCl7XG5cdFx0XHR0aGlzLmNvdW50Kys7XG5cdFx0XHRpZih0aGlzLmNvdW50ICUgNCA9PSAwKXtcblx0XHRcdFx0dGhpcy5pbmRleCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSo2KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmluZGV4ID0gdGhpcy50YXJnZXQ7XG5cdFx0fVxuXHR9XG59XG5cbmxldCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNhbnZhc1wiKTtcbmNhbnZhcy53aWR0aCA9IEhleC53aWR0aDtcbmNhbnZhcy5oZWlnaHQgPSBIZXguaGVpZ2h0O1xuXG5cblxuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgZnVuY3Rpb24gKGV2ZW50KSB7XG5cdGxldCByZWN0ID0gY2FudmFzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRsZXQgbW91c2VYID0gY3VycmVudFN0YXRlLm1vdXNlWCA9IGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQ7XG5cdGxldCBtb3VzZVkgPSBjdXJyZW50U3RhdGUubW91c2VZID0gZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wO1xuXG5cdGN1cnJlbnRTdGF0ZS50aWxlID0gSGV4LnBpeGVsc1RvVGlsZShtb3VzZVgsIG1vdXNlWSk7XG5cdGN1cnJlbnRTdGF0ZS52ZXJ0ZXggPSBIZXgucGl4ZWxzVG9WZXJ0ZXgobW91c2VYLCBtb3VzZVkpO1xuXHRjdXJyZW50U3RhdGUuZWRnZSA9IEhleC5waXhlbHNUb0VkZ2UobW91c2VYLCBtb3VzZVkpO1xufSk7XG5cbmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZnVuY3Rpb24gKGV2ZW50KSB7XG5cdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFxuXHRpZiAoIWN1cnJlbnRTdGF0ZS5hY3Rpb24pIHtcblx0XHRmb3IgKGxldCBjYXJkVHlwZSBpbiBjdXJyZW50U3RhdGUuaGFuZC5jYXJkcykge1xuXHRcdFx0Y2FyZFR5cGUgPSArY2FyZFR5cGU7XG5cblx0XHRcdGxldCBjYXJkQ291bnQgPSBjdXJyZW50U3RhdGUuaGFuZC5jYXJkc1tjYXJkVHlwZV07XG5cdFx0XHRpZiAoY2FyZENvdW50ID09IDApIHsgY29udGludWU7IH1cblxuXHRcdFx0bGV0IGNhcmQgPSBjdXJyZW50U3RhdGUuY2FyZHNbY2FyZFR5cGVdO1xuXHRcdFx0bGV0IFt0eCwgdHldID0gY3VycmVudFN0YXRlLnRpbGU7XG5cdFx0XHRpZiAoY2FyZC5pbkNhcmQoY3VycmVudFN0YXRlLm1vdXNlWCwgY3VycmVudFN0YXRlLm1vdXNlWSkpIHtcblx0XHRcdFx0c3dpdGNoIChjYXJkVHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgQ2F0YW4uS05JR0hUOiBjdXJyZW50U3RhdGUucGxheUtuaWdodCgpOyBicmVhaztcblx0XHRcdFx0XHRjYXNlIENhdGFuLllFQVJfT0ZfUExFTlRZOiBjdXJyZW50U3RhdGUucGxheVllYXJPZlBsZW50eSgpOyBicmVhaztcblx0XHRcdFx0XHRjYXNlIENhdGFuLk1PTk9QT0xZOiBjdXJyZW50U3RhdGUucGxheU1vbm9wb2x5KCk7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgQ2F0YW4uUk9BRF9CVUlMRElORzogY3VycmVudFN0YXRlLnBsYXlSb2FkQnVpbGRpbmcoKTsgYnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm47IFxuXHR9XG5cblx0Y3VycmVudFN0YXRlLmNsaWNrKCk7XG59KTtcblxuXG57XG5cdGxldCBmb3JtID0gZG9jdW1lbnQuZm9ybXMuYnVpbGRpbmc7XG5cblx0bGV0IG1vZGFsQWN0aW9ucyA9IFtcIm1vdmVSb2JiZXJcIiwgXCJzdGVhbFwiXTtcblxuXHRbXCJidWlsZFJvYWRcIiwgXCJidWlsZFRvd25cIiwgXCJidWlsZENpdHlcIl0uZm9yRWFjaChmdW5jdGlvbiAoaWQsIF8sIGlkcykge1xuXHRcdGZvcm1baWRdLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRpZiAobW9kYWxBY3Rpb25zLmluZGV4T2YoY3VycmVudFN0YXRlLmFjdGlvbikgPiAtMSkgeyByZXR1cm47IH1cblxuXHRcdFx0cmVzdG9yZURlZmF1bHRCdXR0b25zKCk7XG5cblx0XHRcdGlmIChjdXJyZW50U3RhdGUuYWN0aW9uID09IGlkKSB7XG5cdFx0XHRcdGRlbGV0ZSBjdXJyZW50U3RhdGUuYWN0aW9uO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnRTdGF0ZS5hY3Rpb24gPSBpZDtcblx0XHRcdGZvcm1baWRdLmlubmVySFRNTCA9IFwiQ2FuY2VsYXJcIjtcblx0XHR9KTtcblx0fSk7XG5cblx0Zm9ybS5idWlsZENhcmQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGZ1bmN0aW9uIChldmVudCkge1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0aWYgKG1vZGFsQWN0aW9ucy5pbmRleE9mKGN1cnJlbnRTdGF0ZS5hY3Rpb24pID4gLTEpIHsgcmV0dXJuOyB9XG5cblx0XHRjdXJyZW50U3RhdGUuYnV5RGV2ZWxvcCgpO1xuXHR9KTtcblxuXHRmb3JtLmVuZFR1cm4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGZ1bmN0aW9uIChldmVudCkge1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0aWYgKG1vZGFsQWN0aW9ucy5pbmRleE9mKGN1cnJlbnRTdGF0ZS5hY3Rpb24pID4gLTEpIHsgcmV0dXJuOyB9XG5cblx0XHRpZiAoY3VycmVudFN0YXRlLmFjdGlvbikge1xuXHRcdFx0cmVzdG9yZURlZmF1bHRCdXR0b25zKCk7XG5cdFx0XHRkZWxldGUgY3VycmVudFN0YXRlLmFjdGlvbjtcblx0XHR9XG5cblx0XHRjdXJyZW50U3RhdGUuZW5kVHVybigpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZURlZmF1bHRCdXR0b25zKCkge1xuXHRsZXQgZm9ybSA9IGRvY3VtZW50LmZvcm1zLmJ1aWxkaW5nO1xuXHRmb3JtLmJ1aWxkUm9hZC5pbm5lckhUTUwgPSBcIkNhcnJldGVyYVwiO1xuXHRmb3JtLmJ1aWxkVG93bi5pbm5lckhUTUwgPSBcIlB1ZWJsb1wiO1xuXHRmb3JtLmJ1aWxkQ2l0eS5pbm5lckhUTUwgPSBcIkNpdWRhZFwiO1xufVxuXG5cbntcblx0bGV0IGZvcm0gPSBkb2N1bWVudC5mb3Jtcy50cmFkaW5nO1xuXG5cdGZvcm0ub2ZmZXIuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGZ1bmN0aW9uIChldmVudCkge1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0Y3VycmVudFN0YXRlLm9mZmVyKHtcblx0XHRcdFtDYXRhbi5PUkVdOiArZm9ybS5vcmUudmFsdWUsXG5cdFx0XHRbQ2F0YW4uV09PRF06ICtmb3JtLndvb2QudmFsdWUsXG5cdFx0XHRbQ2F0YW4uV09PTF06ICtmb3JtLndvb2wudmFsdWUsXG5cdFx0XHRbQ2F0YW4uR1JBSU5dOiArZm9ybS5ncmFpbi52YWx1ZSxcblx0XHRcdFtDYXRhbi5CUklDS106ICtmb3JtLmJyaWNrLnZhbHVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRmb3JtLmNhbmNlbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRjdXJyZW50U3RhdGUuY2FuY2VsKCk7XG5cdH0pO1xuXG5cdFtcblx0XHRmb3JtLmFjY2VwdDAsIGZvcm0uYWNjZXB0MSwgZm9ybS5hY2NlcHQyLCBmb3JtLmFjY2VwdDNcblx0XS5mb3JFYWNoKGZ1bmN0aW9uIChidXR0b24sIGkpIHtcblx0XHRidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGN1cnJlbnRTdGF0ZS5jb25maXJtKGkpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuXG57XG5cdGxldCBmb3JtID0gZG9jdW1lbnQuZm9ybXMuZGlzY2FyZDtcblxuXHRmb3JtLmRpc2NhcmQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGZ1bmN0aW9uIChldmVudCkge1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRsZXQgcmVzb3VyY2VzID0ge1xuXHRcdFx0W0NhdGFuLk9SRV06ICtmb3JtLm9yZS52YWx1ZSxcblx0XHRcdFtDYXRhbi5XT09EXTogK2Zvcm0ud29vZC52YWx1ZSxcblx0XHRcdFtDYXRhbi5XT09MXTogK2Zvcm0ud29vbC52YWx1ZSxcblx0XHRcdFtDYXRhbi5HUkFJTl06ICtmb3JtLmdyYWluLnZhbHVlLFxuXHRcdFx0W0NhdGFuLkJSSUNLXTogK2Zvcm0uYnJpY2sudmFsdWUsXG5cdFx0fTtcblxuXHRcdGxldCB0b0Rpc2NhcmQgPSBNYXRoLmZsb29yKFBsYXllci5jb3VudFJlc291cmNlcyhjdXJyZW50U3RhdGUuaGFuZC5yZXNvdXJjZXMpIC8gMik7XG5cdFx0bGV0IGRpc2NhcmRlZCA9IFBsYXllci5jb3VudFJlc291cmNlcyhyZXNvdXJjZXMpO1xuXHRcdGlmIChkaXNjYXJkZWQgIT0gdG9EaXNjYXJkKSB7XG5cdFx0XHRhbGVydChcInR1IGRlYmVzIGRlc2NhcnRhcnRlLlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjdXJyZW50U3RhdGUud3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2U6IFwiZGVzY2FydGFyXCIsIHJlc291cmNlczogcmVzb3VyY2VzIH0pKTtcblx0fSk7XG5cblx0W1xuXHRcdGZvcm0ub3JlLCBmb3JtLndvb2QsIGZvcm0ud29vbCwgZm9ybS5ncmFpbiwgZm9ybS5icmlja1xuXHRdLmZvckVhY2goZnVuY3Rpb24gKGlucHV0KSB7IGlucHV0LnZhbHVlID0gaW5wdXQubWluID0gMDsgfSk7XG59XG5cbmZ1bmN0aW9uIHNob3dEaXNjYXJkTW9kYWwoY291bnQpIHtcblx0bGV0IGNhcmRzID0gKGNvdW50ID4gMSkgPyBcIkNhcmRzXCIgOiBcIkNhcmRcIjtcblx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkaXNjYXJkLWFtb3VudFwiKS5pbm5lckhUTUwgPSBcIkRpc2NhcmQgXCIgKyBjb3VudCArIFwiIFwiICsgY2FyZHM7XG5cdGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGlzY2FyZC1tb2RhbFwiKS5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuXG5cdGxldCBmb3JtID0gZG9jdW1lbnQuZm9ybXMuZGlzY2FyZDtcblx0Zm9ybS5vcmUubWF4ID0gY3VycmVudFN0YXRlLmhhbmQucmVzb3VyY2VzW0NhdGFuLk9SRV07XG5cdGZvcm0ud29vZC5tYXggPSBjdXJyZW50U3RhdGUuaGFuZC5yZXNvdXJjZXNbQ2F0YW4uV09PRF07XG5cdGZvcm0ud29vbC5tYXggPSBjdXJyZW50U3RhdGUuaGFuZC5yZXNvdXJjZXNbQ2F0YW4uV09PTF07XG5cdGZvcm0uZ3JhaW4ubWF4ID0gY3VycmVudFN0YXRlLmhhbmQucmVzb3VyY2VzW0NhdGFuLkdSQUlOXTtcblx0Zm9ybS5icmljay5tYXggPSBjdXJyZW50U3RhdGUuaGFuZC5yZXNvdXJjZXNbQ2F0YW4uQlJJQ0tdO1xufVxuXG5mdW5jdGlvbiBoaWRlRGlzY2FyZE1vZGFsKCkge1xuXHRkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGlzY2FyZC1tb2RhbCcpLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbn1cblxuXG57XG5cdGxldCBmb3JtID0gZG9jdW1lbnQuZm9ybXMuY2hhdDtcblxuXHRmb3JtLmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdGN1cnJlbnRTdGF0ZS53cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogXCJjaGF0XCIsIHRleHQ6IGZvcm0ubWVzc2FnZS52YWx1ZSB9KSk7XG5cdFx0Zm9ybS5yZXNldCgpO1xuXHR9KTtcbn1cblxubGV0IHNob3dZb3BNb2RhbCA9IGZ1bmN0aW9uICgpIHtcblx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3lvcC1tb2RhbCcpLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG59XG5cbmxldCBoaWRlWW9wTW9kYWwgPSBmdW5jdGlvbiAoKSB7XG5cdGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd5b3AtbW9kYWwnKS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG59XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd5b3AtYnRuJykuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGZ1bmN0aW9uIChldmVudCkge1xuXHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRsZXQgY2hvaWNlMSA9ICtkb2N1bWVudC5mb3Jtcy55b3AuY2hvaWNlMS52YWx1ZTtcblx0bGV0IGNob2ljZTIgPSArZG9jdW1lbnQuZm9ybXMueW9wLmNob2ljZTIudmFsdWU7XG5cdGN1cnJlbnRTdGF0ZS53cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogXCJkZXZlbG9wXCIsIGNhcmQ6IENhdGFuLllFQVJfT0ZfUExFTlRZLCByZXNvdXJjZXM6IFtjaG9pY2UxLCBjaG9pY2UyXSB9KSk7XG5cdGhpZGVZb3BNb2RhbCgpO1xufSk7XG5cbmxldCBzaG93TW9ub3BvbHlNb2RhbCA9IGZ1bmN0aW9uICgpIHtcblx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vbm9wb2x5LW1vZGFsJykuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbn1cblxubGV0IGhpZGVNb25vcG9seU1vZGFsID0gZnVuY3Rpb24gKCkge1xuXHRkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW9ub3BvbHktbW9kYWwnKS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG59XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb25vcG9seS1idG4nKS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZnVuY3Rpb24gKGV2ZW50KSB7XG5cdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdGxldCBjaG9pY2UgPSArZG9jdW1lbnQuZm9ybXMubW9ub3BvbHkuY2hvaWNlLnZhbHVlO1xuXHRjdXJyZW50U3RhdGUud3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2U6IFwiZGV2ZWxvcFwiLCBjYXJkOiBDYXRhbi5NT05PUE9MWSwgdGVycmFpbjogY2hvaWNlIH0pKTtcblx0aGlkZU1vbm9wb2x5TW9kYWwoKTtcbn0pO1xuXG5sZXQgY3R4ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiKTtcbmxldCBsb2JieSA9IG5ldyBMb2JieShjdHgpO1xucnVuKGxvYmJ5KTtcbiBcbmxldCBkaWUxID0gbmV3IERpY2VTcHJpdGUoMTAwLCBbMTAsIDU1MF0pO1xubGV0IGRpZTIgPSBuZXcgRGljZVNwcml0ZSgxMDAsIFs4NywgNTUwXSk7XG4iLCJsZXQgcmFkaXVzID0gNDUsXG5cdGhleGFnb25fbmFycm93X3dpZHRoID0gMyAvIDIgKiByYWRpdXMsXG5cdGhleGFnb25faGVpZ2h0ID0gMiAqIHJhZGl1cyAqIE1hdGguc2luKE1hdGguUEkgLyAzKSxcblx0d2lkdGggPSA5NjAsIGhlaWdodCA9IDY0MDtcblxubW9kdWxlLmV4cG9ydHMgPSB7IHJhZGl1czogcmFkaXVzLCB3aWR0aDogd2lkdGgsIGhlaWdodDogaGVpZ2h0LCB9O1xuXG5sZXQgdGlsZVRvUGl4ZWxzID0gbW9kdWxlLmV4cG9ydHMudGlsZVRvUGl4ZWxzID0gZnVuY3Rpb24gKHgsIHkpIHtcblx0bGV0IHh4ID0geCAtIDMsIHl5ID0geSAtIDM7XG5cdHJldHVybiBbXG5cdFx0d2lkdGggLyA0ICsgMjAgKyBoZXhhZ29uX25hcnJvd193aWR0aCAqIHh4LFxuXHRcdGhlaWdodCAvIDIgLSBoZXhhZ29uX2hlaWdodCAqICh4eCAvIDIgKyB5eSlcblx0XTtcbn07XG5cbmxldCB2ZXJ0ZXhUb1BpeGVscyA9IG1vZHVsZS5leHBvcnRzLnZlcnRleFRvUGl4ZWxzID0gZnVuY3Rpb24gKHgsIHksIGQpIHtcblx0bGV0IFtweCwgcHldID0gdGlsZVRvUGl4ZWxzKHgsIHkpO1xuXHRpZiAoZCA9PSAwKSB7IHB4IC09IHJhZGl1czsgfVxuXHRlbHNlIGlmIChkID09IDEpIHsgcHggKz0gcmFkaXVzOyB9XG5cdHJldHVybiBbcHgsIHB5XTtcbn07XG5cbmxldCBwaXhlbHNUb1RpbGUgPSBtb2R1bGUuZXhwb3J0cy5waXhlbHNUb1RpbGUgPSBmdW5jdGlvbiAocHgsIHB5KSB7XG5cdFxuXHRsZXQgeCA9IChweCAtIHdpZHRoIC8gNCAtIDIwKSAvIGhleGFnb25fbmFycm93X3dpZHRoLFxuXHRcdHkgPSAoaGVpZ2h0IC8gMiAtIHB5KSAvIGhleGFnb25faGVpZ2h0IC0geCAvIDIsXG5cdFx0eiA9IC0oeCArIHkpO1xuXG5cdFxuXHRsZXQgcnggPSBNYXRoLnJvdW5kKHgpLCByeSA9IE1hdGgucm91bmQoeSksIHJ6ID0gTWF0aC5yb3VuZCh6KTtcblx0bGV0IGR4ID0gTWF0aC5hYnMocnggLSB4KSwgZHkgPSBNYXRoLmFicyhyeSAtIHkpLCBkeiA9IE1hdGguYWJzKHJ6IC0geik7XG5cblx0XG5cdGlmIChkeCA+IGR5ICYmIGR4ID4gZHopIHtcblx0XHRyeCA9IC0ocnkgKyByeik7XG5cdH0gZWxzZSBpZiAoZHkgPiBkeikge1xuXHRcdHJ5ID0gLShyeCArIHJ6KTtcblx0fSBlbHNlIHtcblx0XHRyeiA9IC0ocnggKyByeSk7XG5cdH1cblxuXHRyZXR1cm4gW3J4ICsgMywgcnkgKyAzXTtcbn07XG5cbmxldCBwaXhlbHNUb1ZlcnRleCA9IG1vZHVsZS5leHBvcnRzLnBpeGVsc1RvVmVydGV4ID0gZnVuY3Rpb24gKHB4LCBweSkge1xuXHRsZXQgW3gsIHldID0gcGl4ZWxzVG9UaWxlKHB4LCBweSk7XG5cdGxldCBbY3gsIGN5XSA9IHRpbGVUb1BpeGVscyh4LCB5KTtcblx0bGV0IGFuZ2xlID0gTWF0aC5hdGFuMihjeSAtIHB5LCBweCAtIGN4KTtcblx0bGV0IGhleHRhbnQgPSAoTWF0aC5mbG9vcigoYW5nbGUgKyBNYXRoLlBJIC8gNikgLyAyIC8gTWF0aC5QSSAqIDYpICsgNikgJSA2O1xuXG5cdHN3aXRjaCAoaGV4dGFudCkge1xuXHRjYXNlIDA6IHJldHVybiBbeCwgeSwgMV07XG5cdGNhc2UgMTogcmV0dXJuIFt4ICsgMSwgeSwgMF07XG5cdGNhc2UgMjogcmV0dXJuIFt4IC0gMSwgeSArIDEsIDFdO1xuXHRjYXNlIDM6IHJldHVybiBbeCwgeSwgMF07XG5cdGNhc2UgNDogcmV0dXJuIFt4IC0gMSwgeSwgMV07XG5cdGNhc2UgNTogcmV0dXJuIFt4ICsgMSwgeSAtIDEsIDBdO1xuXHR9XG59O1xuXG5sZXQgcGl4ZWxzVG9FZGdlID0gbW9kdWxlLmV4cG9ydHMucGl4ZWxzVG9FZGdlID0gZnVuY3Rpb24gKHB4LCBweSkge1xuXHRsZXQgW3gsIHldID0gcGl4ZWxzVG9UaWxlKHB4LCBweSk7XG5cdGxldCBbY3gsIGN5XSA9IHRpbGVUb1BpeGVscyh4LCB5KTtcblx0bGV0IGFuZ2xlID0gTWF0aC5hdGFuMihjeSAtIHB5LCBweCAtIGN4KTtcblx0bGV0IGhleHRhbnQgPSAoTWF0aC5mbG9vcihhbmdsZSAvIDIgLyBNYXRoLlBJICogNikgKyA2KSAlIDY7XG5cblx0c3dpdGNoIChoZXh0YW50KSB7XG5cdGNhc2UgMDogcmV0dXJuIFt4LCB5LCAyXTtcblx0Y2FzZSAxOiByZXR1cm4gW3gsIHksIDFdO1xuXHRjYXNlIDI6IHJldHVybiBbeCwgeSwgMF07XG5cdGNhc2UgMzogcmV0dXJuIFt4IC0gMSwgeSwgMl07XG5cdGNhc2UgNDogcmV0dXJuIFt4LCB5IC0gMSwgMV07XG5cdGNhc2UgNTogcmV0dXJuIFt4ICsgMSwgeSAtIDEsIDBdO1xuXHR9XG59OyIsIlwidXNlIHN0cmljdFwiO1xuXG5sZXQgQ2F0YW4gPSByZXF1aXJlKFwiLi9jYXRhblwiKS5DYXRhbjtcblxuY29uc3QgQ09TVCA9IHtcblx0W0NhdGFuLlJPQURdOiB7IFtDYXRhbi5CUklDS106IDEsIFtDYXRhbi5XT09EXTogMSB9LFxuXHRbQ2F0YW4uVE9XTl06IHsgW0NhdGFuLkJSSUNLXTogMSwgW0NhdGFuLldPT0RdOiAxLCBbQ2F0YW4uR1JBSU5dOiAxLCBbQ2F0YW4uV09PTF06IDEgfSxcblx0W0NhdGFuLkNJVFldOiB7IFtDYXRhbi5HUkFJTl06IDIsIFtDYXRhbi5PUkVdOiAzIH0sXG5cdFtDYXRhbi5DQVJEXTogeyBbQ2F0YW4uV09PTF06IDEsIFtDYXRhbi5HUkFJTl06IDEsIFtDYXRhbi5PUkVdOiAxIH0sXG59O1xuXG5jbGFzcyBQbGF5ZXJ7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdFxuXHRcdHRoaXMucGllY2VzID0ge1xuXHRcdFx0W0NhdGFuLlJPQURdOiAxNSxcblx0XHRcdFtDYXRhbi5UT1dOXTogNSxcblx0XHRcdFtDYXRhbi5DSVRZXTogNCxcblx0XHR9O1xuXG5cdFx0XG5cdFx0dGhpcy5yZXNvdXJjZXMgPSB7XG5cdFx0XHRbQ2F0YW4uT1JFXTogMCxcblx0XHRcdFtDYXRhbi5XT09EXTogMCxcblx0XHRcdFtDYXRhbi5XT09MXTogMCxcblx0XHRcdFtDYXRhbi5HUkFJTl06IDAsXG5cdFx0XHRbQ2F0YW4uQlJJQ0tdOiAwLFxuXHRcdH07XG5cdFx0dGhpcy5jYXJkcyA9IHtcblx0XHRcdFtDYXRhbi5LTklHSFRdOiAwLFxuXHRcdFx0W0NhdGFuLllFQVJfT0ZfUExFTlRZXTogMCxcblx0XHRcdFtDYXRhbi5NT05PUE9MWV06IDAsXG5cdFx0XHRbQ2F0YW4uVklDVE9SWV9QT0lOVF06IDAsXG5cdFx0XHRbQ2F0YW4uUk9BRF9CVUlMRElOR106IDAsXG5cdFx0fTtcblxuXHRcdHRoaXMua25pZ2h0cyA9IDA7XG5cdH1cblxuXHRoYXNSZXNvdXJjZXMocmVzb3VyY2VTZXQpIHtcblx0XHRmb3IgKGxldCByZXNvdXJjZVR5cGUgaW4gcmVzb3VyY2VTZXQpIHtcblx0XHRcdGlmICh0aGlzLnJlc291cmNlc1tyZXNvdXJjZVR5cGVdIDwgcmVzb3VyY2VTZXRbcmVzb3VyY2VUeXBlXSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzcGVuZFJlc291cmNlcyhyZXNvdXJjZVNldCkge1xuXHRcdGZvciAobGV0IHJlc291cmNlVHlwZSBpbiByZXNvdXJjZVNldCkge1xuXHRcdFx0dGhpcy5yZXNvdXJjZXNbcmVzb3VyY2VUeXBlXSAtPSByZXNvdXJjZVNldFtyZXNvdXJjZVR5cGVdO1xuXHRcdH1cblx0fVxuXG5cdGNhbkFmZm9yZCh0eXBlKSB7XG5cdFx0aWYgKHRoaXMucGllY2VzW3R5cGVdID09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5oYXNSZXNvdXJjZXMoQ09TVFt0eXBlXSk7XG5cdH1cblxuXHRidWlsZCh0eXBlKSB7XG5cdFx0aWYgKHR5cGUgIT0gQ2F0YW4uQ0FSRCkgeyB0aGlzLnBpZWNlc1t0eXBlXSAtPSAxOyB9XG5cdFx0dGhpcy5zcGVuZFJlc291cmNlcyhDT1NUW3R5cGVdKTtcblx0fVxufTtcblxuUGxheWVyLmNvdW50UmVzb3VyY2VzID0gZnVuY3Rpb24gKGhhbmQpIHtcblx0bGV0IHN1bSA9IDA7XG5cdGZvciAobGV0IHJlc291cmNlVHlwZSBpbiBoYW5kKSB7XG5cdFx0c3VtICs9IGhhbmRbcmVzb3VyY2VUeXBlXTtcblx0fVxuXHRyZXR1cm4gc3VtO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXllcjtcbiJdfQ==

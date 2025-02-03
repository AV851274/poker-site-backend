import { Card, ChatMessageModel, ITable, ITablePlayer, TableModel, PotModel, IngressRequestModel } from "../../models/tables.js";
import HyperExpress from "hyper-express";
//@ts-ignore
import shuffle from 'crypto-shuffle';
//@ts-ignore
import { evaluateCards } from 'phe';

export const updateGuestState = async (socket: HyperExpress.Websocket, app: HyperExpress.Server, table: ITable) => {
  // Get table document, filter out hole cards, send to ${tableId} chan
  for (let [_, player] of table.players) {
    if (!(player.isShowing && table.communityCards.length && table.communityCards[0].length == 5)) {
      player.holeCards = [];
    }
    player.isYou = false;
  }

  app.publish(`${socket.context.tableId}`, JSON.stringify({
    type: 'STATE',
    data: table
  }));
}

export const updatePlayerState = async (socket: HyperExpress.Websocket, app: HyperExpress.Server, table: ITable, p: ITablePlayer) => {
  // Get table document, filter out hole cards except userId's, send to ${tableId}/${userId} chan
  for (let [_, player] of Object.entries(table.players)) {
    if (player._id !== p._id) {
      if (!(player.isShowing && table.communityCards.length && table.communityCards[0].length == 5)) {
        player.holeCards = [];
      }
      player.isYou = false;
    } else {
      player.isYou = true;
    }
  }

  app.publish(`${socket.context.tableId}/${p._id}`, JSON.stringify({
    type: 'STATE',
    data: table
  }));
}

export const inlineUpdate = (app: HyperExpress.Server, table: ITable, pids: string[]) => {
  for (const pid of pids) {
    app.publish(`${table._id}/${pid}`, JSON.stringify({
      type: 'BOOT',
      data: {},
    }));
  }
}

export const updateState = async(socket: HyperExpress.Websocket, app: HyperExpress.Server) => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return false;
  for (let [_, p] of table.players) {
    await updatePlayerState(socket, app, JSON.parse(JSON.stringify(table)), p);
  }
  await updateGuestState(socket, app, table);
}

const nthPlayer = (table: ITable, n: number, start: number): number | null => {
  let p: number | null = start;
  let i = 0;
  while (i < n) {
    p = nextPlayerFrom(table, p);
    if (p == null) return null;
    i++;
  }
  return p;
}

const configureSidePots = (table: ITable) => {
  let currentPot = table.pots[table.pots.length-1];
  let jammers = [];
  for (const player of currentPot.players) {
    let px = table.players.get(player)!;
    if (px.allIn && px.bet > 0) {
      jammers.push(px);
    }
  }
  jammers.sort((a, b) => a.bet - b.bet);
  for (let jammer of jammers) {
    let betOverYours = 0;
    let mySeat = [...table.players.entries()].filter(x => x[1]._id == jammer._id)[0][0];
    for (const player of currentPot.players) {
      let px = table.players.get(player)!;
      if (px.inHand) {
        let overage = px.bet - jammer.bet;
        betOverYours += overage;
        px.bet -= overage;
      }
    }
    if (betOverYours === 0) continue;
    currentPot.size -= betOverYours;
    let np = new PotModel({
      size: betOverYours,
      players: currentPot.players.filter((x: string) => x != mySeat),
    });
    table.pots.push(np);
    currentPot = table.pots[table.pots.length-1];
  }
}

const closeAction = async(table: ITable, cards: number) => {
  for (let [_, player] of table.players) {
    console.log('0SETTING', _, player.displayName, ' to zero');
    player.set({
      bet: 0,
    });
  }
  let deck = table.deck;
  let communityCards = [...table.communityCards[0] || []];
  for (let i = 0; i < cards; i++) {
    communityCards.push(deck.pop()!);
  }
  configureSidePots(table);
  table.set({
    communityCards: [communityCards],
    deck,
    turn: nextPlayerFrom(table, table.dealer),
    turnStarted: new Date(),
    currentBet: 0,
    minBet: table.config.blinds[1],
  });
  await table.save();
}

const amIEffectiveButton = (table: ITable, seat: number): boolean => {
  if (table.dealer == seat) return true;
  if (table.players.has(table.dealer.toString()) && table.players.get(table.dealer.toString())!.inHand) return false;
  let i = seat;
  while (i !== table.dealer) {
    if (table.players.has(i.toString())) {
      if (table.players.get(i.toString())!.inHand) return false;
    }
    if (table.config.maxPlayers === 9) {
      if (i == 8) {
        i = 0;
      } else {
        i++;
      }
    } else {
      if (i == 5) {
        i = 0;
      } else {
        i++;
      }
    }
  }

  return true;
}

const foldClosesTheAction = (table: ITable, seat: number): boolean => {
  const np = nextPlayerFrom(table, seat);
  if (np == null) return true;
  let p = table.players.get(np.toString())!;
  return p.bet == table.currentBet
}

const callClosesTheAction = (table: ITable, seat: number): boolean => {
  const np = nextPlayerFrom(table, seat);
  if (np == null) return true;
  let p = table.players.get(np.toString())!;
  if (table.communityCards.length === 0 && table.currentBet == table.config.blinds[1]) return false;
  return p.bet == table.currentBet
}

export const handleCheck = async (socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any, uid='') => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  let me = null;
  let myseat = null;
  let manual = false;
  if (uid === '') {
    uid = socket.context.userId;
    manual = true;
  }
  for (let [seat, player] of table.players) {
    if (player._id === uid) {
      if (table.turn.toString() !== seat) {
        console.log('not your turn');
        return;
      }
      me = player;
      myseat = seat;
      break;
    }
  }
  if (me === null) {
    console.log('not even sitting down');
    return;
  }
  if (me.bet !== table.currentBet) {
    console.log('you cant check');
    return;
  }
  if (manual) {
    me.autoActionCount = 0;
  }
  await serverMsg(socket, app, `${me.displayName} checked`);

  let bb = nthPlayer(table, 2, table.dealer);
  if (bb !== null && parseInt(myseat!) == bb!) {
    console.log('bb check');
    if (!table.communityCards.length) {
      console.log('preflop, closing action');
      await closeAction(table, 3);
      await updateState(socket, app);
      return;
    }
  }
  //if (myseat! == table.dealer.toString()) {
  if (amIEffectiveButton(table, parseInt(myseat!))) {
    console.log('btn check through, closing action');
    if (table.communityCards[0].length === 3 || table.communityCards[0].length === 4) {
      await closeAction(table, 1);
      await updateState(socket, app);
    } else {
      console.log('pussy lol');
      await table.save();
      await settleHand(socket, app);
      await updateState(socket, app);
    }
    return;
  }

  console.log('checking to next player');
  table.set({
    turn: nextPlayerFrom(table, parseInt(myseat!)),
    turnStarted: new Date(),
  });
  await table.save();
  await updateState(socket, app);
  dispatchActionChecks(socket, app);
};
export const handleBet = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  if (typeof data.amount !== "number" || data.amount < 1 || !Number.isSafeInteger(data.amount)) return;
  let amount = data.amount;

  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  let me = null;
  let myseat = null;
  let isEveryoneAllin = true;
  for (let [seat, player] of table.players) {
    if (player.inHand && !player.allIn && !player.folded && player._id !== socket.context.userId) isEveryoneAllin = false;
    if (player._id === socket.context.userId) {
      if (table.turn.toString() !== seat) {
        console.log('not your turn');
        return;
      }
      me = player;
      myseat = seat;
    }
  }
  if (me === null) {
    console.log('not even sitting down');
    return;
  }
  if (isEveryoneAllin) {
    console.log('everyone already all in, you cant bet more!');
    return;
  }

  let stack = me.stack;
  let bet = me.bet;
  let npot = 0;
  if (bet > 0) {
    stack += bet;
    npot = bet;
    bet = 0;
  }
  if (amount > me.stack+me.bet) {
    console.log('bigger bet than your stack, buster');
    return;
  }
  let allIn = false;
  if (Math.abs(amount - stack) < table.config.blinds[1] && stack > table.currentBet) {
    allIn = true;
  }
  if (amount < table.minBet && !allIn) {
    console.log('minimum 2x bet');
    return;
  }
  if (!allIn) {
    await serverMsg(socket, app, `${me.displayName} bet ${(amount/100).toFixed(2)}`);
  } else {
    await serverMsg(socket, app, `${me.displayName} jammed for ${(stack/100).toFixed(2)}`);
  }
  me.set({
    stack: allIn ? 0 : stack - amount,
    bet: allIn ? stack : amount,
    allIn,
    autoActionCount: 0,
  });
  table.pots[table.pots.length-1].set({
    size: table.pots[table.pots.length-1].size + amount - npot,
  });
  table.set({
    turn: nextPlayerFrom(table, parseInt(myseat!)),
    turnStarted: new Date(),
    currentBet: amount,
    minBet: amount + (amount - table.currentBet),
  });
  await table.save();
  await updateState(socket, app);
  dispatchActionChecks(socket, app);
};

export const handleBack = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  let seat = -1;
  for (let [key, player] of table.players) {
    if (player._id === socket.context.userId) {
      seat = parseInt(key);
      break;
    }
  }

  if (seat < 0) return;

  await TableModel.updateOne({_id: socket.context.tableId}, {
    $set: {
      [`players.${seat}.status`]: 'ACTIVE',
    }
  });
  await updateState(socket, app);
};

export const handleAway = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  let seat = -1;
  for (let [key, player] of table.players) {
    if (player._id === socket.context.userId) {
      seat = parseInt(key);
      break;
    }
  }

  if (seat < 0) return;

  await TableModel.updateOne({_id: socket.context.tableId}, {
    $set: {
      [`players.${seat}.status`]: 'AWAY',
    }
  });
  await updateState(socket, app);
};

export const handleSit = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  if (typeof data.displayName !== "string" || data.displayName.length > 10 || !/^[a-zA-Z0-9]+$/.test(data.displayName)) return ;
  if (typeof data.amount !== "number" || data.amount < 1 || !Number.isSafeInteger(data.amount)) return;
  if (typeof data.seat !== "number") return;
  let amount = data.amount;
  console.log(amount);
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  if (table.config.maxPlayers === 6 && (data.seat > 5 || data.seat < 0)) return;
  if (table.config.maxPlayers === 9 && (data.seat > 8 || data.seat < 0)) return;
  if (table.players.has(data.seat)) return;
  for (let [_, player] of table.players) {
    if (player._id == socket.context.userId) {
      // already sat
      return;
    }
  }

  if (table.owner !== socket.context.userId) {
    await IngressRequestModel.create({
      seat: data.seat,
      displayName: data.displayName,
      pid: socket.context.userId,
      tid: socket.context.tableId,
      stack: data.amount,
    });
    await serverMsg(socket, app, `${data.displayName} wants to join the table`);
  } else {
    socket.unsubscribe(`${socket.context.tableId}`);
    socket.subscribe(`${socket.context.tableId}/${socket.context.userId}`);
    await serverMsg(socket, app, `${data.displayName} bought in for ${(amount/100).toFixed(2)}`);

    let buyins = 0;
    let dips = 0;
    if (table.ledger.has(socket.context.userId)) {
      buyins = table.ledger.get(socket.context.userId)!.buyIn;
      dips = table.ledger.get(socket.context.userId)!.dippedWithStack;
    }
    await TableModel.updateOne({_id: socket.context.tableId}, {
      $set: {
        [`players.${data.seat}`]: {
          stack: amount,
          bet: 0,
          status: "ACTIVE",
          displayName: data.displayName,
          _id: socket.context.userId,
          username: data.displayName,
          holeCards: [],
          allIn: false,
          inHand: false,
          winner: false,
          folded: false,
          agreeToRunItTwice: false,
          isShowing: false,
          autoActionCount: 0,
        },
        [`ledger.${socket.context.userId}`]: {
          buyIn: buyins + amount,
          dipped: false,
          dippedWithStack: dips,
          displayName: data.displayName,
        },
      }
    });
    await updateState(socket, app);
  }
};

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function actionCheck(socket: HyperExpress.Websocket, app: HyperExpress.Server) {
  let table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;
  if (table.turn == -1) return;

  if (Math.abs(new Date().getTime() - table.turnStarted.getTime()) > 15*1000) {
    if (!table.players.has(table.turn.toString())) return;
    let ac = table.players.get(table.turn.toString())!.autoActionCount;
    console.log('AAACCC', ac);
    table.players.get(table.turn.toString())!.set({autoActionCount: ac + 1});
    if (table.players.get(table.turn.toString())!.autoActionCount >= 2) {
      table.players.get(table.turn.toString())!.set({status: 'AWAY'});
    }
    await table.save();
    await updateState(socket, app);
    if (table.currentBet > table.players.get(table.turn.toString())!.bet) {
      await handleFold(socket, app, {}, table.players.get(table.turn.toString())!._id);
    } else {
      await handleCheck(socket, app, {}, table.players.get(table.turn.toString())!._id);
    }
    /*
    table = await TableModel.findById(socket.context.tableId).exec();
    if (table == null) return;
    */
  } else if (Math.abs(new Date().getTime() - table.turnStarted.getTime()) > 10*1000) {
    await serverMsg(socket, app, 'Wake tf up');
  }
}

function dispatchActionChecks(socket: HyperExpress.Websocket, app: HyperExpress.Server) {
  setTimeout(() => {
    actionCheck(socket, app);
  }, 11000);
  setTimeout(() => {
    actionCheck(socket, app);
  }, 16000);
}

const settleHand = async(socket: HyperExpress.Websocket, app: HyperExpress.Server) => {
  let table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;
  if (!table.communityCards.length) table.communityCards.push([]);
  if (table.communityCards[0].length < 5) {
    table.decidingRunItTwice = true;
    await table.save();
    await updateState(socket, app);
    await delay(5000);
    table = await TableModel.findById(socket.context.tableId).exec();
    if (table === null) return;
    const rit = everyoneAgreesToRunItTwice(table);
    if (rit) {
      table.communityCards.push(table.communityCards[0]);
    }
    console.log('no more action, running it out');
    let x = 5 - table.communityCards[0].length;
    table.set({
      turn: -1,
    });
    for (let i = 0; i < x; i++) {
      table.communityCards[0].push(table.deck.pop()!);
      if (rit) {
        table.communityCards[1].push(table.deck.pop()!);
      }
      if (table.communityCards[0].length < 3) continue;
      await table.save();
      await updateState(socket, app);
      await delay(1000);
    }
  }
  table = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;
  console.log('settling pots');
  if (table.communityCards.length == 1) {
    for (const pot of table.pots) {
      let heval = Infinity;
      let pp: ITablePlayer[] = [];
      console.log('checking pot of size', pot.size);
      for (const player of pot.players) {
        let px = table.players.get(player)!;
        if (pot.players.length > 1) px.set({isShowing: true});
        const fivecards = [...table.communityCards[0], ...px.holeCards].map(card => `${card.rank.replace('10', 'T')}${card.suit == 'SPADES' ? 's' : card.suit == 'HEARTS' ? 'h' : card.suit == 'CLUBS' ? 'c' : card.suit == 'DIAMONDS' ? 'd': ''}`);
        const re = evaluateCards(fivecards);
        if (re < heval) {
          heval = re;
          pp = [px];
        } else if (re == heval) {
          pp.push(px);
        }
      }
      console.log('the winner(s) (are)(is)', pp.map(x => x.displayName).join(","), heval);
      if (pp.length === 1) {
        pp[0]?.set({
          stack: pp[0].stack + pot.size,
          winner: true,
        });
        await serverMsg(socket, app, `${pp[0]?.displayName} won a pot for ${(pot.size/100).toFixed(2)}`);
      } else {
        let chops = Math.round(pot.size/pp.length);
        for (let player of pp) {
          player.set({
            stack: player.stack + chops,
            winner: true,
          });
          await serverMsg(socket, app, `${player.displayName} chopped a pot for ${(chops/100).toFixed(2)}`);
        }
      }
    }
  } else {
    for (const pot of table.pots) {
      console.log('checking pot of size', pot.size);
      for (const runOut of table.communityCards) {
        let heval = Infinity;
        let pp: ITablePlayer[] = [];
        for (const player of pot.players) {
          let px = table.players.get(player)!;
          if (pot.players.length > 1) px.set({isShowing: true});
          const fivecards = [...runOut, ...px.holeCards].map(card => `${card.rank.replace('10', 'T')}${card.suit == 'SPADES' ? 's' : card.suit == 'HEARTS' ? 'h' : card.suit == 'CLUBS' ? 'c' : card.suit == 'DIAMONDS' ? 'd': ''}`);
          const re = evaluateCards(fivecards);
          console.log(px.displayName, fivecards, re);
          if (re < heval) {
            heval = re;
            pp = [px];
          } else if (re == heval) {
            pp.push(px);
          }
        }
        console.log(`the winner(s) for runout ${runOut} (are)(is)`, pp.map(x => x.displayName).join(","), heval);
        if (pp.length === 1) {
          let portion = Math.round(pot.size/table.communityCards.length);
          pp[0]?.set({
            stack: pp[0].stack + portion,
            winner: true,
          });
          await serverMsg(socket, app, `${pp[0]?.displayName} won a pot for ${(pot.size/100).toFixed(2)}`);
        } else {
          let portion = Math.round(pot.size/table.communityCards.length);
          let chops = Math.round(portion/pp.length);
          for (let player of pp) {
            player.set({
              stack: player.stack + chops,
              winner: true,
            });
            await serverMsg(socket, app, `${player.displayName} chopped a pot for ${(chops/100).toFixed(2)}`);
          }
        }
      }
    }
  }
  let pids = [];
  let good = 0;
  await table.save();
  await updateState(socket, app);
  console.log(table.players);
  for (let [seat, player] of table.players) {
    if (player.stack < 1) {
      table.players.delete(seat);
      table.ledger.get(player._id)!.dipped = true;
      pids.push(player._id);
      continue; // fuck you
    } else if (player.status === 'ACTIVE') {
      good++;
    }
    console.log('1SETTING', seat, player.displayName, ' to zero');
    player.set({
      bet: 0,
      allIn: false,
    });
  }
  inlineUpdate(app, table, pids);
  table.set({
    turn: -1,
    pots: [],
    decidingRunItTwice: false,
  });
  if (good < 2) {
    table.set({
      active: false,
    });
  }
  await table.save();
  setTimeout(async() => {
    const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
    if (table === null) return;
    if (table.active) {
      newHand(socket, app, table);
    }
  }, 10000);
}

export const handleFold = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any, uid='') => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  let me = null;
  let myseat = null;
  let manual = false;
  if (uid === '') {
    uid = socket.context.userId;
    manual = true;
  }
  for (let [seat, player] of table.players) {
    if (player._id === uid) {
      if (table.turn.toString() !== seat) {
        console.log('not your turn');
        return;
      }
      me = player;
      myseat = seat;
      break;
    }
  }
  if (me === null) {
    console.log('not even sitting down');
    return;
  }
  if (table.currentBet === 0) { // no funny business
    return handleCheck(socket, app, data);
  }
  if (manual) me.autoActionCount = 0;
  me.set({
    inHand: false,
    folded: true,
  });
  await serverMsg(socket, app, `${me.displayName} folded`);
  for (const pot of table.pots) {
    pot.players = pot.players.filter(x => x != myseat);
  }
  //if (nthPlayer(table, 2, parseInt(myseat!)) == null) {
  if ([...table.players.values()].filter(p => p.inHand && !p.allIn).length < 2) {
    console.log('hand is over');
    configureSidePots(table);
    await table.save();
    await settleHand(socket, app);
    await updateState(socket, app);
    return;
  }
  if (foldClosesTheAction(table, parseInt(myseat!))) {
    if (table.communityCards.length == 0) {
      await closeAction(table, 3);
    } else if (table.communityCards[0].length === 3 || table.communityCards[0].length === 4) {
      await closeAction(table, 1);
    } else {
      console.log('hand is over');
      configureSidePots(table);
      await table.save();
      await settleHand(socket, app);
    }
    await updateState(socket, app);
    return;
  }
  table.set({
    turn: nextPlayerFrom(table, parseInt(myseat!)),
    turnStarted: new Date(),
  });
  await table.save();
  await updateState(socket, app);
  dispatchActionChecks(socket, app);
};

const everyoneAgreesToRunItTwice = (table: ITable): boolean => {
  let ret = true;
  for (let [seat, player] of table.players) {
    if (!player.agreeToRunItTwice && player.inHand) ret = false;
  }

  return ret;
}

export const handleRunItTwice = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any, uid='') => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  let me = null;
  let myseat = null;
  if (uid === '') uid = socket.context.userId;
  for (let [seat, player] of table.players) {
    if (player._id === uid) {
      me = player;
      myseat = seat;
      break;
    }
  }
  if (me === null) {
    console.log('not even sitting down');
    return;
  }

  me.agreeToRunItTwice = true;
  await table.save();
  await updateState(socket, app);
};

export const handleCall = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any, uid='') => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  let me = null;
  let myseat = null;
  if (uid === '') uid = socket.context.userId;
  for (let [seat, player] of table.players) {
    if (player._id === uid) {
      if (table.turn.toString() !== seat) {
        console.log('not your turn');
        return;
      }
      me = player;
      myseat = seat;
      break;
    }
  }
  if (me === null) {
    console.log('not even sitting down');
    return;
  }
  if (table.currentBet == 0) {
    console.log('calling literal air');
    return;
  }

  let stack = me.stack;
  let bet = me.bet;
  let npot = 0;
  if (bet > 0) {
    stack += bet;
    npot = bet;
    bet = 0;
  }
  if (stack <= table.currentBet) {
    // so we're all in
    me.set({
      allIn: true,
      stack: 0,
      bet: stack,
      autoActionCount: 0,
    });
    table.pots[table.pots.length-1].set({
      size: table.pots[table.pots.length-1].size + stack - npot,
    });
    await serverMsg(socket, app, `${me.displayName} called all in`);
  } else {
    me.set({
      stack: stack - table.currentBet,
      bet: table.currentBet,
      autoActionCount: 0,
    });
    await serverMsg(socket, app, `${me.displayName} called for ${(table.currentBet/100).toFixed(2)}`);
    table.pots[table.pots.length-1].set({
      size: table.pots[table.pots.length-1].size + table.currentBet - npot,
    });
  }
  if ([...table.players.values()].filter(p => p.inHand && !p.allIn).length < 2) {
    console.log('hand is over');
    configureSidePots(table);
    await table.save();
    await settleHand(socket, app);
    await updateState(socket, app);
    return;
  }
  if (callClosesTheAction(table, parseInt(myseat!))) {
    if (table.communityCards.length == 0) {
      await closeAction(table, 3);
    } else if (table.communityCards[0].length === 3 || table.communityCards[0].length === 4) {
      await closeAction(table, 1);
    } else {
      console.log('hand is over');
      configureSidePots(table);
      await table.save();
      await settleHand(socket, app);
    }
    await updateState(socket, app);
    return;
  }
  table.set({
    turn: nextPlayerFrom(table, parseInt(myseat!)),
    turnStarted: new Date(),
  });
  await table.save();
  await updateState(socket, app);
  dispatchActionChecks(socket, app);
};
export const handlePause = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;
  if (!table.active) return;
  await serverMsg(socket, app, 'Table is paused');

  table.set({active: false});
  await table.save();
  await updateState(socket, app);
};
export const handleShow = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;
  if (!table.active) return;

  for (let [_, player] of table.players) {
    if (player._id === socket.context.userId) {
      player.set({
        isShowing: true,
      });
      break;
    }
  }

  await table.save();
  await updateState(socket, app);
};

export const handleUnshow = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;
  if (!table.active) return;

  for (let [_, player] of table.players) {
    if (player._id === socket.context.userId) {
      player.set({
        isShowing: false,
      });
      break;
    }
  }

  await table.save();
  await updateState(socket, app);
};

const newDeck = async(): Promise<Card[]> => {
  let deck: Card[] = [{"suit":"SPADES","rank":"A"},{"suit":"SPADES","rank":"2"},{"suit":"SPADES","rank":"3"},{"suit":"SPADES","rank":"4"},{"suit":"SPADES","rank":"5"},{"suit":"SPADES","rank":"6"},{"suit":"SPADES","rank":"7"},{"suit":"SPADES","rank":"8"},{"suit":"SPADES","rank":"9"},{"suit":"SPADES","rank":"10"},{"suit":"SPADES","rank":"J"},{"suit":"SPADES","rank":"Q"},{"suit":"SPADES","rank":"K"},{"suit":"DIAMONDS","rank":"A"},{"suit":"DIAMONDS","rank":"2"},{"suit":"DIAMONDS","rank":"3"},{"suit":"DIAMONDS","rank":"4"},{"suit":"DIAMONDS","rank":"5"},{"suit":"DIAMONDS","rank":"6"},{"suit":"DIAMONDS","rank":"7"},{"suit":"DIAMONDS","rank":"8"},{"suit":"DIAMONDS","rank":"9"},{"suit":"DIAMONDS","rank":"10"},{"suit":"DIAMONDS","rank":"J"},{"suit":"DIAMONDS","rank":"Q"},{"suit":"DIAMONDS","rank":"K"},{"suit":"CLUBS","rank":"A"},{"suit":"CLUBS","rank":"2"},{"suit":"CLUBS","rank":"3"},{"suit":"CLUBS","rank":"4"},{"suit":"CLUBS","rank":"5"},{"suit":"CLUBS","rank":"6"},{"suit":"CLUBS","rank":"7"},{"suit":"CLUBS","rank":"8"},{"suit":"CLUBS","rank":"9"},{"suit":"CLUBS","rank":"10"},{"suit":"CLUBS","rank":"J"},{"suit":"CLUBS","rank":"Q"},{"suit":"CLUBS","rank":"K"},{"suit":"HEARTS","rank":"A"},{"suit":"HEARTS","rank":"2"},{"suit":"HEARTS","rank":"3"},{"suit":"HEARTS","rank":"4"},{"suit":"HEARTS","rank":"5"},{"suit":"HEARTS","rank":"6"},{"suit":"HEARTS","rank":"7"},{"suit":"HEARTS","rank":"8"},{"suit":"HEARTS","rank":"9"},{"suit":"HEARTS","rank":"10"},{"suit":"HEARTS","rank":"J"},{"suit":"HEARTS","rank":"Q"},{"suit":"HEARTS","rank":"K"}];
  shuffle(deck);
  return deck;
}

function nextPlayerFrom(table: ITable, n: number, orig?: number) {
  if (!orig) orig = n;

  let pn = n;
  if (table.config.maxPlayers === 9) {
    if (n == 8) {
      pn = 0;
    } else {
      pn += 1;
    }
  } else {
    if (n == 5) {
      pn = 0;
    } else {
      pn += 1;
    }
  }

  // TODO: and not folded
  if (pn == orig) return null;
  if (table.players.has(pn.toString())) {
    let pxx = table.players.get(pn.toString())!;
    if (pxx.status == 'ACTIVE' && pxx.inHand && !pxx.allIn) return pn;
  }
  return nextPlayerFrom(table, pn, orig);
}

const newHand = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, table: ITable) => {
  let deck = await newDeck();
  for (const [_, player] of table.players) {
    if (player.status === 'ACTIVE') {
      player.set({
        'holeCards': [deck.pop(), deck.pop()],
        'inHand': true,
      })
    }
    player.set({
      isShowing: false,
      folded: false,
      winner: false,
      agreeToRunItTwice: false,
    });
  }
  // set button position
  const dealer = nextPlayerFrom(table, table.dealer);
  table.set({
    dealer,
  });
  if (dealer === null) {
    console.error('dealer is null. og dealer:', table.dealer);
    return;
  }
  // put in the blinds
  let sb = nextPlayerFrom(table, dealer);
  if (sb === null) {
    console.error('sb is null.');
    return;
  }
  let bb = nextPlayerFrom(table, sb);
  if (bb === null) {
    console.error('bb is null.');
    return;
  }
  let antes = 0;
  // TODO: sidepot & allin for bb
  for (let [seat, player] of table.players) {
    if (player.status === 'ACTIVE') {
      player.set({'stack': player.stack - table.config.ante});
      antes += table.config.ante;
    }
    if (seat == sb.toString()) {
      if (player.stack > table.config.blinds[0]) {
        player.set({
          'stack': player.stack - table.config.blinds[0],
          'bet': table.config.blinds[0],
        });
      } else {
        player.set({
          allIn: true,
          stack: 0,
          bet: player.stack,
        });
      }
    } else if (seat == bb.toString()) {
      if (player.stack > table.config.blinds[1]) {
        player.set({
          'stack': player.stack - table.config.blinds[1],
          'bet': table.config.blinds[1],
        });
      } else {
        player.set({
          allIn: true,
          stack: 0,
          bet: player.stack,
        });
      }
    }
  }
  table.set({
    pots: [{
      size: table.config.blinds[0]+table.config.blinds[1]+antes,
      players: [...table.players.entries()].filter(x => x[1].status == 'ACTIVE').map(x => x[0]),
    }],
    deck,
    turn: nextPlayerFrom(table, bb),
    turnStarted: new Date(),
    currentBet: table.config.blinds[1],
    communityCards: [],
    minBet: table.config.blinds[1]*2,
  });

  await table.save();
  await updateState(socket, app);
  dispatchActionChecks(socket, app);
}

export const handleStart = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;
  if (table.active) return;
  let players = 0;
  for (const [_, player] of table.players) {
    players += player.status === 'ACTIVE' ? 1 : 0;
  }
  if (players < 2) return;

  table.set({active: true});
  await serverMsg(socket, app, 'Table has started');
  await newHand(socket, app, table);
};
export const handleLeave = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  for (let [seat, player] of table.players) {
    if (player._id === socket.context.userId) {
      console.log('leave?');
      if (player.inHand) return;
      console.log('leave');
      table.ledger.get(player._id)!.dipped = true;
      table.ledger.get(player._id)!.dippedWithStack += player.stack;
      table.players.delete(seat);
      await table.save();
      console.log(table.players);
      await updateState(socket, app);
      inlineUpdate(app, table, [player._id]);
      console.log('breaka');
      return;
    }
  }
  console.log('_____not even sitting down');
};
export const handleRebuy = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
};
const serverMsg = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, msg: string) => {
  let chat = await ChatMessageModel.create({
    author: {
      stack: 0,
      bet: 0,
      status: "ACTIVE",
      displayName: "Server",
      _id: socket.context.userId,
      username: 'Server',
      holeCards: [],
      allIn: false,
      inHand: false,
      winner: false,
      agreeToRunItTwice: false,
      folded: false,
      isShowing: false,
      autoActionCount: 0,
    },
    server: true,
    message: msg,
    tableId: socket.context.tableId,
  });
  app.publish(`${socket.context.tableId}/chat`, JSON.stringify({
    type: 'CHAT',
    data: chat,
  }));
}
export const handleSendChat = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  if (typeof data.message !== "string" || data.message.length > 200) return;
  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;
  let player = null;
  for (const [_, p] of table.players) {
    if (p._id == socket.context.userId) {
      player = p;
      break;
    }
  }
  let chat = await ChatMessageModel.create({
    author: player || {
      stack: 0,
      bet: 0,
      status: "ACTIVE",
      displayName: "guest",
      _id: socket.context.userId,
      username: 'guest',
      holeCards: [],
      allIn: false,
      agreeToRunItTwice: false,
      inHand: false,
      winner: false,
      folded: false,
      isShowing: false,
      autoActionCount: 0,
    },
    server: false,
    message: data.message,
    tableId: socket.context.tableId,
  });
  app.publish(`${socket.context.tableId}/chat`, JSON.stringify({
    type: 'CHAT',
    data: chat,
  }));
};
export const handleSetConfig = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
};
export const handleDeny = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  if (typeof data.ingressRequestId !== "string") return;
  await IngressRequestModel.deleteOne({_id: data.ingressRequestId});
}
export const handleApprove = async(socket: HyperExpress.Websocket, app: HyperExpress.Server, data: any) => {
  console.table(data);
  if (typeof data.playerId !== "string") return;
  if (typeof data.ingressRequestId !== "string") return;
  if (typeof data.displayName !== "string" || data.displayName.length > 10 || !/^[a-zA-Z0-9]+$/.test(data.displayName)) return ;
  if (typeof data.stack !== "number" || data.stack < 1 || !Number.isSafeInteger(data.stack)) return;
  if (typeof data.seat !== "number") return;
  console.table(data);

  const table: ITable | null = await TableModel.findById(socket.context.tableId).exec();
  if (table === null) return;

  if (table.config.maxPlayers === 6 && (data.seat > 5 || data.seat < 0)) return;
  if (table.config.maxPlayers === 9 && (data.seat > 8 || data.seat < 0)) return;
  for (let [_, player] of table.players) {
    if (player._id == data.playerId) {
      // already sat
      return;
    }
  }
  let seat = data.seat;
  if (table.players.has(data.seat)) {
    let seats = table.config.maxPlayers == 6 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let open = seats.filter(x => !table.players.has(x.toString()));
    if (open.length === 0) return;
    seat = open[0];
  };

  await serverMsg(socket, app, `${data.displayName} bought in for ${(data.stack/100).toFixed(2)}`);

  let buyins = 0;
  let dips = 0;
  if (table.ledger.has(data.playerId)) {
    buyins = table.ledger.get(data.playerId)!.buyIn;
    dips = table.ledger.get(data.playerId)!.dippedWithStack;
  }
  await TableModel.updateOne({_id: socket.context.tableId}, {
    $set: {
      [`players.${seat}`]: {
        stack: data.stack,
        bet: 0,
        status: "ACTIVE",
        displayName: data.displayName,
        _id: data.playerId,
        username: data.displayName,
        holeCards: [],
        allIn: false,
        inHand: false,
        winner: false,
        agreeToRunItTwice: false,
        folded: false,
        isShowing: false,
        autoActionCount: 0,
      },
      [`ledger.${data.playerId}`]: {
        buyIn: buyins + data.stack,
        dipped: false,
        dippedWithStack: dips,
        displayName: data.displayName,
      },
    }
  });
  await IngressRequestModel.deleteOne({_id: data.ingressRequestId});
  inlineUpdate(app, table, [data.playerId]);
  await updateState(socket, app);
};

export const ensureOwner = async (userId: string, tableId: string): Promise<boolean> => {
  const table: ITable | null = await TableModel.findById(tableId).exec();
  if (table === null) return false;
  return table.owner === userId;
};

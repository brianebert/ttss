import {Encrypted_Node} from "@brianebert/tss";
import * as toml from "toml";
import * as fs from 'fs';

// turn off caching to force ipfs repo reads
Encrypted_Node.cache.readFrom = false;

// shorten long strings
function abrevIt(id){
  return `${id.slice(0, 10)}...${id.slice(-10)}`
}

/*
Encrypted_Node.source.url = cid => `https://<<your ipfs gateway>>/${cid.toString()}/`;
// Use result of /block/put as argument to sink.url(cid) to get pinning url
Encrypted_Node.sink.url = cid => typeof cid === 'string' ? `https://<<your ipfs rpc api>>/pin/add?arg=${cid}` :
                          `https://<<your ipfs rpc api>>/block/put?cid-codec=${Encrypted_Node.codecForCID(cid).name}`;
*/


// two test account ids (TA_[01]) and secret strings (TS_[01]) are required
if(Object.keys(fs.default).length){ // running node
  if(Encrypted_Node.sink.url === false)
    console.warn(`tss test will write into a ***VOLATILE localStorage*** object.`, localStorage);
  var {TA_0, TS_0, TA_1, TS_1} = toml.parse(fs.readFileSync('app.toml', 'utf8'));
}
else // get keys from browswer user
  var {TA_0, TS_0, TA_1, TS_1} = await new Promise((resolve, reject) => 
      document.getElementById(`keys`).addEventListener('change', (e) => {
        resolve( // creates an object from app.toml strings pasted into text area
          Object.fromEntries(
            e.target.value.trim().split('\n')
             .map(line => line.trim().split('='))
             .map(entry => [entry[0].trim(), entry[1].replace(/[ ']/g, "")])
          )
        )
      })
    );

console.log(`Using keys\n\tTA_0: ${abrevIt(TA_0)}, \n\tTS_0: S..., \n\tTA_1: ${abrevIt(TA_1)}, \n\tTS_1: S...`);

// make four level graph to test on:
//       g00
//       /  \
//    g10    g11
//    /  \   /  \
// g20    g21   g22
//     \_  |  _/
//       \ | /
//        g30
async function makeGraph(keys, sA){
  // object indices allow direct manipulation of node values
  const g = {};
  g['g30'] = await new Encrypted_Node({'colName': 'g30'}, sA).write('g30', keys);

  g['g20'] = await new Encrypted_Node({'colName': 'g20'}, sA).insert([g['g30']], keys);
  g['g21'] = await new Encrypted_Node({'colName': 'g21'}, sA).insert([g['g30']], keys);
  g['g22'] = await new Encrypted_Node({'colName': 'g22'}, sA).insert([g['g30']], keys);

  g['g10'] = await new Encrypted_Node({'colName': 'g10'}, sA).insert([g['g20'], g['g21']], keys);
  g['g11'] = await new Encrypted_Node({'colName': 'g11'}, sA).insert([g['g21'], g['g22']], keys);

  g['g00'] = await new Encrypted_Node({'colName': 'g00'}, sA).insert([g['g10'], g['g11']], keys);

  return g
}

// recursive COL_Node.traverse() displays nodes of graph in reverse depth first order
async function showGraph(head, keys=null, logNodeValue=false){
  // showNode will be called on each node read by COL_Node.traverse()
  async function showNode(instance){
    // extract major axis from node name and indent that much
    const indent = "\t".repeat(parseInt(instance.name.slice(1,2)));

    // nodes are printed in leaf first order, with the root node at the bottom
    console.log(`${indent}node ${instance.name} at ${abrevIt(instance.cid.toString())}`,
                !logNodeValue && Object.hasOwn(instance.value, 'keyType') ? 
                ` has keyType set to ${instance.value.keyType} ` : ' ');
    for(const [name, cid] of Object.entries(instance.links))
      console.log(`${indent} - links to ${name} at ${abrevIt(cid.toString())}`);
  }
  await Encrypted_Node.traverse(head.cid, showNode, keys);
}

// tests encrypted graph write and read for self
// THIS FUNCTION IS NOT CALLED IN DEFAULT TEST
// BECAUSE SENDING AN ENCRYPTED MESSAGE TESTS
// ASYMMETRIC ENCRYPTION
async function asymetricKeyTest(signingAccount){
  console.log(`building graph for asymetric key test`);
  const wKeys = {reader: signingAccount.ec25519.pk, writer: signingAccount.ec25519.sk};
  const rKeys = {reader: signingAccount.ec25519.sk, writer: signingAccount.ec25519.pk};
  const graph = await makeGraph(wKeys, signingAccount);
  console.log(`testing graph management with asymetric key encryption on new graph at head ${graph.g00.cid.toString()}`);
  await showGraph(graph.g00, rKeys);

  // change value of leaf node and bubble hash changes to new graph head
  let value = Object.assign({}, graph.g30.value);
  value['keyType'] = `asymetric ${new Date().toUTCString()}`;
  let head = await graph.g30.update(value, wKeys);
  await showGraph(head, rKeys);

  // delete a node and bubble hash changes to new graph head
  head = await graph.g20.delete(wKeys);
  await showGraph(head, rKeys);

  return head
}

// tests encrypted graph write and read with key shared with another account
async function sharedKeyTest(signingAccount, shareWith){
  const {rx, tx} = await signingAccount.keys.sharedWith(shareWith.account.id, 'libsodium_kx_pk');
  console.log(`${abrevIt(signingAccount.id)} is creating a DAG to test link management with shared key encryption`);
  const graph = await makeGraph({shared: tx}, signingAccount);
  console.log(`created a new graph with head ${graph.g00.cid.toString()}`);
  console.log(`\n${abrevIt(signingAccount.id)} is starting traversal of graph headed at ${graph.g00.cid.toString()}`);
  await showGraph(graph.g00, {shared: tx});
  console.log(`finished traversal of graph headed at ${graph.g00.cid.toString()}\n`);
 
  let value = Object.assign({}, graph.g30.value);
  value['keyType'] = `shared ${new Date().toUTCString()}`;
  let head = await graph.g30.update(value, {shared: tx});
  console.log(`you should see address changes ripple through every node of the graph.`);
  console.log(`\n${abrevIt(signingAccount.id)} is starting traversal of graph headed at ${head.cid.toString()}`);
  await showGraph(head, {shared: tx});
  console.log(`finished traversal of graph headed at ${head.cid.toString()}\n`);

  head = await graph.g20.delete({shared: tx});
  console.log(`note how deleting node g20 only required updates to two ancestors.`);
  console.log(`\n${abrevIt(signingAccount.id)} is starting traversal of graph headed at ${head.cid.toString()}`);
  await showGraph(head, {shared: tx});
  console.log(`finished traversal of graph headed at ${head.cid.toString()}\n`);

  return head
}

// will derive signing keys, asymetric encryption keys, 
// and key exchange keys for shared key encryption
async function initSigningAccount(address=null, sk=null){
  // if sk is falsy, will call wallet to sign key derivation transaction
  const signingAccount = await Encrypted_Node.SigningAccount.checkForWallet(address, sk); await signingAccount.ready;
  console.log(`\ninitializing SigningAccount ${abrevIt(signingAccount.id)}`);
  console.log(`you may see multiple "waiting for Stellar Consensus" lines while your test accounts are configured with data entries`);
  console.log(`for public keys libsodium_box_pk and libsodium_kx_pk, which allow people to address you with public/private key encryption`);
  console.log(`or shared key exchange, and market offers for "MesssageMe" and "SharedData" tokens which people can buy and return to you`);
  console.log(`with pointers to their message or data root attached. If your account is missing any of those, a Stellar transaction will`);
  console.log(`be called to set each missing value`)

  if(signingAccount.canSign)
    // adds derived ed25519 key to account signers
    await signingAccount.addSigner();

  // will execute transactions to add data entries with public keys if not present already
  await signingAccount.setDataEntry('libsodium_box_pk', Buffer.from(signingAccount.ec25519.pk));
  await signingAccount.setDataEntry('libsodium_kx_pk', Buffer.from(signingAccount.shareKX.pk));

  // creates sell offers for messaging tokens if they don't already exist
  // MessageMe communicates message is encoded with asymetric keys
  // ShareData communicates message is encoded with a shared key
  for(let token of ['MessageMe', 'ShareData']){
    await Encrypted_Node.SigningAccount.sellOffer(signingAccount, {selling: token});
  }

  console.log(`${abrevIt(signingAccount.id)} has been initialized\n`);
  return signingAccount
}

// uses message token asste_code to determine which cipher to use
// traverses linked data
async function readMessages(messages){
  for(const message of messages){
    switch(message.asset_code){
    case 'MessageMe':
      const pk = await Encrypted_Node.SigningAccount.dataEntry(message.from, 'libsodium_box_pk');
      var keys = {reader: this.ec25519.sk, writer: pk};
      var node = await Encrypted_Node.read(Encrypted_Node.SigningAccount.memoToCID(message.transaction.memo), keys);
      break;
    case 'ShareData':
      const {rx, tx} = await this.keys.sharedWith(message.from, 'libsodium_kx_pk');
      var keys = {shared: rx};
      var node = await Encrypted_Node.read(Encrypted_Node.SigningAccount.memoToCID(message.transaction.memo), keys);
      break;
    default:
      throw new Error(`wasn't expecting to get here`)
    }
    const links = node.links;
    for(const key of Object.keys(links))
      if(key.endsWith('_last'))
        delete links[key];
    console.group();
    if(Object.keys(links).length){
      console.log(`${abrevIt(this.id)} found a DAG root from ${abrevIt(message.from)} at ${abrevIt(node.cid.toString())}.`);
      console.log(`${abrevIt(this.id)} is starting traversal of graph headed at ${node.cid.toString()}`);
      await showGraph(node, keys);
      console.log(`finished traversal of graph headed at ${node.cid.toString()}`);
    }
    else 
      console.log(`${abrevIt(this.id)} found message from ${abrevIt(message.from)} at ${abrevIt(node.cid.toString())} containing`, node.value);
    console.groupEnd();
  }
}

// tests:
// - management of graph encrypted for self with public/private keys
// - sending and receiving of short message encrypted from sender to
//   receiver with public/private keys
// - management of graph encrypted with key shared between sender and receiver
// - discovery and processing of unread messages waiting at start of reader
// - real time processing of incoming messages
async function testCols(){
  // need two test accounts to test encryption and messaging
  const sA0 = await initSigningAccount(TA_0, TS_0);
  const sA1 = await initSigningAccount(TA_1, TS_1);
  if(!(sA0 instanceof Encrypted_Node.SigningAccount) || !(sA1 instanceof Encrypted_Node.SigningAccount))
    throw new Error(`failed to create signing accounts.`)

  // create a short, private message between accounts and send it from the first account to the second
  console.log(`\ncreating a private message from ${abrevIt(sA0.id)} to ${abrevIt(sA1.id)} encrypted with libsodium crypto_box_easy. the message`);
  console.log(`is added to ipfs and its address sent to its recipient attached to a MessageMe token payment in the transaction memo`);
  const pk = await Encrypted_Node.SigningAccount.dataEntry(sA1, 'libsodium_box_pk');
  const message = await new Encrypted_Node({colName: 'private message', message:`hi, ${abrevIt(sA1.account.id)}!`}, sA0)
                            .write('', {reader: pk, writer: sA0.ec25519.sk});
  const receipt0 = await sA0.messengerTx(message.cid, sA1.account.id, 'MessageMe');
  console.log(`sent transaction ${receipt0.hash} carrying message ${abrevIt(message.cid.toString())} `);
  
  // verify watcher finds and a message waiting and processes it
  const waiting = await sA1.watcher.start(sA1, readMessages);
  console.log(`${abrevIt(sA1.id)}'s MessageWatcher started and found ${waiting.length} message(s) waiting. while ${abrevIt(sA1.id)} marks its`);
  console.log(`message queue with a "MessagesRead" token, ${abrevIt(sA0.id)} will start testing DAG link maintenance. we'll hear more from`);
  console.log(`${abrevIt(sA1.id)} asynchronously processes messages waiting or as they arrive. ${abrevIt(sA1.id)}'s MessageWatcher will continue`);
  console.log(`waiting for more messages, so this program will not end until you terminate it. I hope you've enjoyed running this code! BE`);

  // repeat graph management test with shared key encryption
  console.log(`\n${abrevIt(sA0.id)} is going to test tss link maintenance for a graph encrypted with a key shared with ${abrevIt(sA1.id)}`);
  const sharedData = await sharedKeyTest(sA0, sA1);
  
  // send the graph root address to the other account to receive and process in real time
  console.log(`\n${abrevIt(sA0.id)} will send the graph's root address to ${abrevIt(sA1.id)} in the transaction memo of a ShareData token payment`);
  let receipt1 = await sA0.messengerTx(sharedData.cid, sA1.account.id, 'ShareData');
  console.log(`sent transaction ${receipt1.hash} carrying shared data root address ${abrevIt(sharedData.cid.toString())} `);
}

testCols()
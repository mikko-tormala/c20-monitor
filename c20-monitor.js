const fs = require('fs');
const got = require('got');
const argv = require('yargs').argv;
const colors = require('colors');
const humanize = require('humanize');
const humanizeTime = require('humanize-time');

const refresh = updateValue.bind(this);
const format = humanize.numberFormat;
const bold = colors.bold;
const green = colors.green;
const red = colors.red;

let startTime = 0;
let startNAV = 0;
let startFund = 0;
let lastNAV = 0;
let lastFund = 0;

const config = fs.existsSync('./config.json') 
  ? require('./config.json') 
  : {
    stake: 10000,
    updateInterval: 120000,
    changeInterval: 3600000
  };
const storedData = argv.stake ? null : (fs.existsSync('./data.json') ? require('./data.json') : null);

const USER_STAKE = argv._[0] || argv.stake || config.stake; 
const REFRESH_TIME = (argv._[1] * 1000) || (argv.time*1000) || config.updateInterval;
const CHANGE_INTERVAL = (argv._[2] * 1000) || (argv.change*1000) || config.changeInterval;

/*
 * Init
 */
console.log(`
${green.bold('Starting C20 monitoring.')}
Stake size: ${bold(USER_STAKE)} C20. 
Refresh C20 value every: ${bold(humanizeTime(REFRESH_TIME))}. 
Show changes since start every: ${bold(humanizeTime(CHANGE_INTERVAL))}.`);

setInterval(printDeltaSinceStart, CHANGE_INTERVAL);
updateValue();

process.on('SIGINT', function() {
  printDeltaSinceStart();
  process.exit();
});

// Add support for exiting with ESC
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
  if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
    process.exit();
  }
});

/*
 * Methods
 */
function updateValue() {
  got(`https://crypto20.com/status`)
    .then(response => {
      let data = JSON.parse(response.body);
      printValue(data);
      setTimeout(refresh, REFRESH_TIME)
    })
    .catch(error => {
      console.log(`Error retrieving C20 data: ${error.code}. Trying again in 10 seconds.`);
      setTimeout(refresh, 10000)
    });
}

function printValue(data) {
  let nav = data.nav_per_token;
  // Only continue if the NAV has actually changed.
  if (lastNAV == nav) return;
  
  let positiveChange = nav > lastNAV;

  let stake = nav * USER_STAKE;
  let fundValue = Math.round(data.usd_value / 1000);

  let deltaNAV = format(Math.abs(nav-lastNAV), 4);
  let deltaStake = format(Math.abs((stake-(lastNAV * USER_STAKE))), 0);
  let deltaFund = format(Math.abs(fundValue - lastFund), 0);

  let cDeltaNAV = positiveChange ? green(`+$${deltaNAV}`) : red(`-$${deltaNAV}`);
  let cDeltaValue = positiveChange ? green(`+$${deltaStake}`) : red(`-$${deltaStake}`);
  let cDeltaFund = positiveChange ? green(`+$${deltaFund}K`) : red(`-$${deltaFund}K`);
  let time = humanize.date('m/d H:i');
  
  if (lastNAV !== 0) {
    console.log(`${time} > C20 value: $${bold(format(nav,4))} (${cDeltaNAV}). C20 Fund: $${bold(format(fundValue,0))}K (${cDeltaFund}). Stake value: $${bold(format(stake,0))} (${cDeltaValue}).`);  
  } else {
    console.log(`${time} > C20 value: $${bold(format(nav,4))}.  C20 Fund: $${bold(format(fundValue,0))}K.  Stake value: $${bold(format(stake,0))}.`);
  }

  lastNAV = nav;
  lastFund = fundValue;

  if (startTime == 0) {
    // If stored data exists. Print out changes since last save.
    if (storedData && storedData.nav && storedData.fund && storedData.time) {
      startNAV = storedData.nav;
      startFund = storedData.fund;
      startTime = storedData.time;
      printDeltaSinceStart(true);
    }
    
    // First run. Store starting values.
    startNAV = nav;
    startFund = fundValue;
    startTime = humanize.time();
  }

  saveToFile({
    nav: data.nav_per_token,
    fund: data.usd_value/1000,
    time: humanize.time()
  })
}

function printDeltaSinceStart(isRestart) {
  if (startTime == 0) return;
  let startStr = isRestart ? 'last saved data' : 'start';
  
  let value = lastNAV * USER_STAKE;
  let positiveChange = lastNAV > startNAV;
  let deltaNAV = format( Math.abs(lastNAV-startNAV), 4);
  let deltaValue = format( Math.abs(value-(startNAV * USER_STAKE)), 0);
  let deltaFund = format(Math.abs(lastFund - startFund), 0);
  let deltaTime = bold(humanize.relativeTime(startTime));

  let cDeltaNAV = positiveChange ? green(`+$${deltaNAV}`) : red(`-$${deltaNAV}`)
  let cDeltaValue = positiveChange ? green(`+$${deltaValue}`) : red(`-$${deltaValue}`)
  let cDeltaFund = positiveChange ? green(`+$${deltaFund}K`) : red(`-$${deltaFund}K`)
  let time = humanize.date('m/d H:i');

  console.log(`${time} > Change since ${startStr} (${deltaTime}): C20 value: ${cDeltaNAV}.  C20 Fund: ${cDeltaFund}.  Stake value: ${cDeltaValue}.`);
}

function saveToFile(data) {
  fs.writeFile("./data.json", JSON.stringify(data), function(error) {
    if (error) {
      return console.log(`Error writing to file: ${error.code}`);
    }
  }); 
}
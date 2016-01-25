console.log("testing...");

function one() {
  return new Promise(function(resolve, reject) {
    two().then(resolve, reject);
  });
}

function two() {
  return new Promise(function(resolve, reject) {
    resolve("herp");
  });
}

one().then(console.log);

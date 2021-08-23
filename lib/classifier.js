"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadClassifier = void 0;
var natural = require('natural');
async function loadClassifier() {
    return new Promise((res, rej) => {
        natural.BayesClassifier.load('class.json', null, function (err, classifier) {
            if (err) {
                rej(err);
            }
            else {
                res(classifier);
            }
        });
    });
}
exports.loadClassifier = loadClassifier;
//# sourceMappingURL=classifier.js.map
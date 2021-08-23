var natural = require('natural');

// A Classifier that is trained to detect informatoin from noise.
const classifier = new natural.BayesClassifier();

// Correct
classifier.addDocument('MB1 - Zoetermeer MB1', 'correct')
classifier.addDocument('H1 - Reigers H1', 'correct')
classifier.addDocument('MA1 - Voordaan MA1', 'correct')
classifier.addDocument('JA1 - HGC JA1', 'correct')

// Suspicious
classifier.addDocument('MB2 - Phoenix onbekend', 'suspicious');
classifier.addDocument('H1 - ', 'suspicious');

// Train the classifier
classifier.train();

classifier.save('class.json')
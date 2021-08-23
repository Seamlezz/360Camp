var natural = require('natural');

export async function loadClassifier(): Promise<any> {
    return new Promise((res, rej) => {
        natural.BayesClassifier.load('class.json', null, function (err: any, classifier: any) {
            if (err) {
                rej(err)
            } else {
                res(classifier)
            }
        })
    })
}


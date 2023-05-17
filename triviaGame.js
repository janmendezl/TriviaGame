const express = require("express"); 
const app = express(); 
const path = require("path");
const bodyParser = require("body-parser");
// Placeholder
const portNumber = 5000;
process.stdin.setEncoding("utf8");

require("dotenv").config({ path: path.resolve(__dirname, '.env') });
// Relies on .env
const userName = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;
const databaseAndQuestionCollection = {db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_COLLECTION_QUESTIONS};
const databaseAndUserInfoCollection = {db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_COLLECTION_USERINFO};
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = `mongodb+srv://${userName}:${password}@cluster0.s3ockcc.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
let triviaToken;
fetch('https://opentdb.com/api_token.php?command=request')
    .then(result => result.json())
    .then(json => triviaToken = json.token);

process.stdout.write(`Web server started and running at http://localhost:${portNumber}\n`);
process.stdout.write(`Stop to shutdown the server: `);
process.stdin.on("readable", function () {
    let userInput = process.stdin.read();
    if (userInput !== null) {
        let command = userInput.trim();
        if (command === "stop") {
            console.log("Shutting down the server");
            process.exit(0);  /* exiting */
        }
    } else {
        console.log(`Invalid commnad: ${command}`);
    }
});

//Initializing Database 
async function initializeDB() {
    try {
        await client.connect();
        // CAN CHANGE!!!!!
        let triviaAPIURL = `https://opentdb.com/api.php?amount=5&difficulty=medium&type=multiple&token=${triviaToken}`;
        const result = await fetch(triviaAPIURL);
        const json = await result.json();
        let _questions = await json.results;
        let count = 1;
        await _questions.forEach(elem => {
            elem.question_number = count++;
        })
        console.log(_questions);
        await insertMultipleQuestions(client, databaseAndQuestionCollection, _questions);
        console.log("initialize done");
    } catch (e) {
        console.error(e);
    }
}

async function insertMultipleQuestions(client, databaseAndQuestionCollection, questionsArray) {
    await client.connect();
    const result = await client.db(databaseAndQuestionCollection.db)
                        .collection(databaseAndQuestionCollection.collection)
                        .insertMany(questionsArray);
    console.log(`Inserted ${result.insertedCount} questions`);
}


// GLOBAL VARIABLES
let username;
let questions = [];
let userAnswers = [];
let correctAnswers = [];
let correctCount = 0;

// Endpoints
app.use(bodyParser.urlencoded({extended:false}));

app.use(express.static(__dirname + '/'));

app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");

app.get("/", (request, response) => {
    response.render("index");
});

app.post("/", (request, response) => { 
    username = request.body.username;
    initializeDB()
    .then(() => {
        console.log("starting trivia!");
        response.redirect("/question1");
    })
    .catch(console.error);
});

app.get("/accessScores", (request, response) => {
    response.render("accessScores");
});

app.post("/accessScores", (request, response) => {
    username = request.body.username;
    lookUpUser(client, databaseAndUserInfoCollection, username)
    .then(result => {
        if (result) {
            console.log(result);
            let correctCount = 0;
            table = `<table border='1'><tr><th>Question</th><th>${username}'s Answer</th><th>Correct Answer</th></tr>`;
            result.questions.forEach((elem, index) => {
                let uAns = result.userAnswers[index];
                let cAns = result.correctAnswers[index];
                correctCount = uAns == cAns ? correctCount + 1 : correctCount;
                table += `<tr><td>${elem}</td><td>${uAns}</td><td>${cAns}</td></tr>`
            })
            table += "</table>";
            return {
                summaryTable: table,
                totalScore: correctCount
            };
        } else {
            return {
                summaryTable: "User not found",
                totalScore: "None"
            }
        }
    })
    .then(variables => response.render("summary", variables));
});

async function lookUpUser(client, databaseAndUserInfoCollection, username) {
    await client.connect();
    let filter = {username: username};
    const result = await client.db(databaseAndUserInfoCollection.db)
                        .collection(databaseAndUserInfoCollection.collection)
                        .findOne(filter);
   if (result) {
       console.log("found" + result);
       return result;
   } else {
       console.log(`No user found with name ${username}`);
       return undefined;
   }
}

app.get("/question1", (request, response) => { 
    lookUpQuestion(1)
    .then(result => {
        console.log("THISSSSSSSSSSSSW" + result);
        if (result) {
            let answerChoices = result.incorrect_answers.concat([result.correct_answer]);
            const shuffledChoices = answerChoices.sort((a, b) => 0.5 - Math.random());
            let buttons = "";
            shuffledChoices.forEach(choice => {
                buttons += `<label><input type="radio" name="answer" value="${choice}">${choice}</label>`
            });
            correctAnswers.push(result.correct_answer);
            questions.push(result.question);
            return {
                question: result.question,
                choices: buttons,
            };
        } else {
            return {
                question: "ERROR",
                choices: "ERROR",
            };
        }
    }).then(variables => {
        response.render("question1", variables)});
});

app.post("/question1", (request, response) => {
    userAnswers.push(request.body.answer);
    if (userAnswers[0] == correctAnswers[0]) {
        correctCount++;
    }
    response.redirect("/question2")
});

app.get("/question2", (request, response) => { 
    lookUpQuestion(2).then(result => {
        if (result) {
            let answerChoices = result.incorrect_answers.concat([result.correct_answer]);
            const shuffledChoices = answerChoices.sort((a, b) => 0.5 - Math.random());
            let buttons = "";
            shuffledChoices.forEach(choice => {
                buttons += `<label><input type="radio" name="answer" value="${choice}">${choice}</label>`
            });
            correctAnswers.push(result.correct_answer);
            questions.push(result.question);
            return {
                question: result.question,
                choices: buttons,
            };
        } else {
            return {
                question: "ERROR",
                choices: "ERROR",
            };
        }
    }).then(variables => {
        response.render("question2", variables)});
});

app.post("/question2", (request, response) => {
    userAnswers.push(request.body.answer);
    if (userAnswers[1] == correctAnswers[1]) {
        correctCount++;
    }
    response.redirect("/question3")
});

app.get("/question3", (request, response) => { 
    lookUpQuestion(3).then(result => {
        if (result) {
            let answerChoices = result.incorrect_answers.concat([result.correct_answer]);
            const shuffledChoices = answerChoices.sort((a, b) => 0.5 - Math.random());
            let buttons = "";
            shuffledChoices.forEach(choice => {
                buttons += `<label><input type="radio" name="answer" value="${choice}">${choice}</label>`
            });
            correctAnswers.push(result.correct_answer);
            questions.push(result.question);
            return {
                question: result.question,
                choices: buttons,
            };
        } else {
            return {
                question: "ERROR",
                choices: "ERROR",
            };
        }
    }).then(variables => {
        response.render("question3", variables)});
});

app.post("/question3", (request, response) => {
    userAnswers.push(request.body.answer);
    if (userAnswers[2] == correctAnswers[2]) {
        correctCount++;
    }
    response.redirect("/question4")
});

app.get("/question4", (request, response) => { 
    lookUpQuestion(4).then(result => {
        if (result) {
            let answerChoices = result.incorrect_answers.concat([result.correct_answer]);
            const shuffledChoices = answerChoices.sort((a, b) => 0.5 - Math.random());
            let buttons = "";
            shuffledChoices.forEach(choice => {
                buttons += `<label><input type="radio" name="answer" value="${choice}">${choice}</label>`
            });
            correctAnswers.push(result.correct_answer);
            questions.push(result.question);
            return {
                question: result.question,
                choices: buttons,
            };
        } else {
            return {
                question: "ERROR",
                choices: "ERROR",
            };
        }
    }).then(variables => {
        response.render("question4", variables)});
});

app.post("/question4", (request, response) => {
    userAnswers.push(request.body.answer);
    if (userAnswers[3] == correctAnswers[3]) {
        correctCount++;
    }
    response.redirect("/question5")
});

app.get("/question5", (request, response) => { 
    lookUpQuestion(5).then(result => {
        if (result) {
            let answerChoices = result.incorrect_answers.concat([result.correct_answer]);
            const shuffledChoices = answerChoices.sort((a, b) => 0.5 - Math.random());
            let buttons = "";
            shuffledChoices.forEach(choice => {
                buttons += `<label><input type="radio" name="answer" value="${choice}">${choice}</label>`
            });
            correctAnswers.push(result.correct_answer);
            questions.push(result.question);
            return {
                question: result.question,
                choices: buttons,
            };
        } else {
            return {
                question: "ERROR",
                choices: "ERROR",
            };
        }
    }).then(variables => {
        response.render("question5", variables)});
});

app.post("/question5", (request, response) => {
    userAnswers.push(request.body.answer);
    if (userAnswers[4] == correctAnswers[4]) {
        correctCount++;
    }
    response.redirect("/summary")
});

app.get("/summary", (request, response) => { 
    let scoreTable = localDataSummaryTable();

    variables = {
        summaryTable: scoreTable,
        totalScore: correctCount
    };

    clearQuestionsDB().then(response.render("summary", variables));
});

async function insertUser(client, databaseAndUserInfoCollection, user) {
    try {
        await client.connect();
        await client.db(databaseAndUserInfoCollection.db)
        .collection(databaseAndUserInfoCollection.collection)
        .insertOne(user);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

app.post("/summary", (request, response) => { 
    user = {
        username: username, 
        questions: questions,
        correctAnswers: correctAnswers,
        userAnswers: userAnswers
    }
    questions = [];
    userAnswers = [];
    correctAnswers = [];
    correctCount = 0;
    insertUser(client, databaseAndUserInfoCollection, user)
        .then(response.redirect("/"));
});

async function lookUpQuestion(questionNumber) {
    try {
        await client.connect();
        let filter = {question_number: questionNumber};
        let result = await client.db(databaseAndQuestionCollection.db)
                            .collection(databaseAndQuestionCollection.collection)
                            .findOne(filter);
        return result;
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

async function clearQuestionsDB() {
    try {
        await client.connect();
        const result = await client.db(databaseAndQuestionCollection.db)
        .collection(databaseAndQuestionCollection.collection)
        .deleteMany({});
        console.log(`Deleted documents ${result.deletedCount}`);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

function localDataSummaryTable() {
    table = "<table border='1'><tr><th>Question</th><th>Your Answer</th><th>Correct Answer</th></tr>";
    console.log(questions);
    questions.forEach((elem, index) => {
        table += `<tr><td>${elem}</td><td>${userAnswers[index]}</td><td>${correctAnswers[index]}</td></tr>`
    })
    table += "</table>"
    return table;
}


app.listen(portNumber);
# Fitness-Tracker
A Fitness Tracker App that lets user create workouts, log exercise and track progression
- Version 1:
  + Add ExerciseSet class to reprensent a set of an exercise
  + Add Exercise class to represent an exercise, each exercise will have a name and a list contains of its set objects
  + Add methods of addSet, removeSet to the Exercise class
  + Add saving exercise
- Version 2:
  + Added Workout class to represent a Workout
  + Added App class to run the app and control app flow
- Version 3:
  + Added FileHandler method to save and load data into the program
- Version 4:
  + Implemented DatabaseHandler using SQLite to save data locally
  + Fully tested with adding data, deleting to database and loading data back from database using SQL (Java integrated)
  + Polished console-based front end with clear instruction and display
- Version 5:
  + Implemented history tracking to the App, now user will track their data by session, eachh exercise will print out its saved data from previous session
    
## How to Run
1. Clone the repo: git clone https://github.com/nlong3242/Fitness-Tracker.git
2. Compile: javac -cp ".;lib/sqlite-jdbc-3.51.3.0.jar" *.java
3. Run: java -cp ".;lib/sqlite-jdbc-3.51.3.0.jar" Main

## Technologies Used
- Java
- SQLite (JDBC)
- Git

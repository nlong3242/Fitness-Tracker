import java.util.ArrayList;
import java.util.Scanner;

public class App {
    Scanner scanner = new Scanner(System.in);
    DatabaseHandler handler = new DatabaseHandler();
    ArrayList<Workout> workouts = new ArrayList<>();

    // Method to create a new workout
    void createWorkout(){
        // Create Workout object and ADD it to the list of workouts
        boolean running = true;
        System.out.print("Enter workout name or Enter to quit: ");
        String name = scanner.nextLine();
        if (name.equals(""))
            return;
        int id = handler.saveWorkout(name);
        Workout workout = new Workout(name);
        workout.id = id;
        workouts.add(workout);

        while (running) {
            // Print menu
            System.out.println("1. Add new exercise");
            int input = getIntOrCancel("Choose an option or Enter to quit: ");
            
            // Handling inputs
            if (input == -1)
                running = false;
            else{
                // Handling invalid inputs and out of order input
                if (input == 1)
                    addExercise(workout);
                else
                    System.out.println("Please choose option from menu");

                }
            }
        }

    // Method to view and modify workouts
    void viewWorkout(){
        boolean running = true;

        // Print out menu
        while (running){
            // If no workouts then return user to main menu
            if (workouts.isEmpty()){
                System.out.println("No workouts saved!");
                return;
            }
            // Print out list of available workouts
            System.out.println("Workouts:");
            for (int i = 0; i < workouts.size(); i++) {
                System.out.println((i+1) + ". " + workouts.get(i).workout_name);
            }
            System.out.println("-----");
            int input = getIntOrCancel("Choose a workout to modify or Enter to quit: ");

            // Handling inputs
            if (input == -1)
                running = false;

            else{
                // Returning the correct workout that got chosen
                    
                if (input <= workouts.size() && input >= 1){
                    Workout workout = workouts.get(input - 1);
                    modifyWorkout(workout);
                }
                else
                    System.out.println("Please choose from list of workouts");
                    
                }
            }
        }

    

    // Method to add an exercise to a workout
    void addExercise(Workout workout){
        System.out.print("Enter the name of your exercise or Enter to quit: ");
        String exerciseName = scanner.nextLine();
        if (exerciseName.equals(""))
            return;
        int id = handler.saveExercise(exerciseName, workout.id);
        Exercise exercise = new Exercise(exerciseName);
        exercise.id = id;
        workout.addExercise(exercise);
    }

    // Method to delete an exercise from a selected workout
    void deleteExercise(Workout workout){
        boolean running = true;
        if (workout.exercises.isEmpty()){
            System.out.println("No exercises to remove!");
            return;
        }

        while (running){
            // If no exercies then return to the previous menu
            if(workout.exercises.isEmpty()){
                System.out.println("All exercies removed!");
                return;
            }
            System.out.println(workout);
            System.out.println("------");
            int input = getIntOrCancel("Choose an exercise to delete or Enter to quit: ");
            if (input == -1)
                running = false;
            else{
                // Handling valid and invalid inputs
                if (input <= workout.exercises.size() && input >= 1){
                    Exercise removed_exercise = workout.exercises.remove(input - 1); // Remnove the chosen exercise
                    System.out.println(removed_exercise.name + " removed");
                        
                }
                else
                    System.out.println("Please choose exercise from list of exerices");

            }    
        }
    }
    
    // Method to delete a selected workout from a list of workouts
    void deleteWorkout (Workout workout){
        workouts.remove(workout);
        handler.deleteWorkout(workout.id);
        System.out.println("Workout: " + workout.workout_name + " removed");

    }

    // Method to modify a chosen workout
    void modifyWorkout(Workout workout){
        boolean running = true;
        while (running){
            System.out.println(workout);
            System.out.println("------");
            System.out.println("1. Add exercise");
            System.out.println("2. Delete exercise");
            System.out.println("3. Delete workout");
            int input = getIntOrCancel("Choose an option or Enter to quit: ");
            if (input == -1)
                running = false;
            else{
  
                if (input == 1){
                    addExercise(workout);                     
                }
                else if (input == 2){
                    deleteExercise(workout);
                }
                else if (input == 3){
                    deleteWorkout(workout);
                    return;
                }
                else
                    System.out.println("Please choose an option from menu");

            }
        }

    }

    void addSet(Exercise exercise) {
        double weight = getDouble("Enter Weight: ");
        int reps = getInt("Enter reps: ");
        int id = handler.saveSet(weight, reps, exercise.id);
        ExerciseSet set = new ExerciseSet(weight, reps);
        set.id = id;
        exercise.addSet(set);
    }

    void deleteSet(Exercise exercise) {
        boolean removing = true;
        System.out.println("Sets:");
        for (int i = 0; i < exercise.sets.size(); i++){
            System.out.println("Set: "+ (i + 1) + ".\n" + exercise.sets.get(i));
        }
        while (removing){
            int setIndex = getIntOrCancel("Choose a set to remove or Enter to quit: ");
            if (setIndex == -1)
                removing = false;

            else if (setIndex <= exercise.sets.size() && setIndex >= 1){
                exercise.removeSet(setIndex - 1);
                removing = false;
            }
            else{
                System.out.println("Please choose an option from menu");
            }
        }
    }

    void startWorkout(){
        // If no workout then return to main menu
        if (workouts.isEmpty()){
            System.out.println("No workout saved!");
            return;
        }

        boolean choosing = true;
        Workout workout = null;
        while (choosing){
            // Print out list of available workouts
            System.out.println("Workouts:");
            for (int i = 0; i < workouts.size(); i++) {
                System.out.println((i+1) + ". " + workouts.get(i).workout_name);
            }
            System.out.println("-----");
            int input = getIntOrCancel("Choose a workout to start or Enter to exit: ");
            if (input == -1)
                return;
            else if (input <= workouts.size() && input >= 1){
                workout = workouts.get(input - 1);
                choosing = false;
            }
            else
                System.out.println("Please choose an option from list of workouts");


        }

        if (workout.exercises.isEmpty()){
            System.out.println("No exercises saved!");
            return;
        }

        boolean running = true;
        int index = 0;

        while (running){
            // If out of indexing then print out exiting menu
            if (index >= workout.exercises.size()){
                boolean exiting = true;
                while (exiting){
                    System.out.println("------");
                    for (Exercise exercise: workout.exercises){
                        System.out.println(exercise);
                        System.out.println("-------");

                    }
                    String header = "No more exercises Enter to finish workout or 3 to previous exericse: ";
                    System.out.print(header);
                    String exit = scanner.nextLine();
                    if (exit.equals("")){
                        return;
                    }
                    else if (exit.equals("3")){
                        index--;
                        exiting = false;
                    }
                    else
                        System.out.println("Invalid choice");
                }

            }

            // Print out exercise name and its sets 
            Exercise exercise = workout.exercises.get(index);
            System.out.println("------");
            System.out.print("Exercise: ");
            System.out.println(exercise.name);
            for (int i = 0; i < exercise.sets.size(); i++){
                System.out.println("Set: " + (i + 1) + ".\n" + exercise.sets.get(i));
            }
            System.out.println("------");
            System.out.println("1. Add set");
            System.out.println("2. Remove Set");
            System.out.println("3. Previous exericse");
            int option = getIntOrCancel("Choose an option or Enter to go to the next exercise: ");

            // If Enter then update index pointer to the next exercise
            if (option == - 1)
                index++;
            else{
                if (option == 1){
                    addSet(exercise);
                }
                else if (option == 2){
                    if (exercise.sets.isEmpty()){
                        System.out.println("No sets saved!");    
                    }
                    else{
                        deleteSet(exercise);
                    }
                }
                else if (option == 3){
                    if (index == 0){
                        System.out.println("No previous exercise");
                        continue;
                    }
                    index--;  // Update index pointer to transverse backwards
                }
                else{
                    System.out.println("Please choose option from menu");
                }

            }
        }
    }
    
    // Return a double value 
    double getDouble(String prompt){
        while (true) { 
            System.out.print(prompt);
            try {
                return Double.parseDouble(scanner.nextLine());
            } catch (NumberFormatException e) {
                System.out.println("Invalid input");
            }
        }
    }

    // Return a int value
    int getInt(String prompt){
        while (true) { 
            System.out.print(prompt);
            try {
                return  Integer.parseInt(scanner.nextLine());
            } catch (NumberFormatException e) {
                System.out.println("Invalid input");
            }   
        }
    }

    // Return either -1 if Enter or an int value
    int getIntOrCancel(String prompt) {
        while (true) {
            System.out.print(prompt);
            String input = scanner.nextLine();
            if (input.equals(""))
                return -1;
            try {
                return Integer.parseInt(input);
            } catch (NumberFormatException e) {
                System.out.println("Invalid input");
            }
        }
    }

    // Run the app
    void run(){
        boolean running = true;
        System.out.println("Welcome to Tsu2Track!");
        while (running) { 
            // Print main menu
            System.out.println("\nMAIN MENU:");
            System.out.println("-------");
            System.out.println("1. Create Workout");
            System.out.println("2. View Workouts");
            System.out.println("3. Start Workout");

            // Handling inputs
            int input = getIntOrCancel("Choose an option or Enter to quit: ");
            if (input == -1){
                
                System.out.println("See you again!");
                running = false;
            }
            else {
                //Handling invalid inputs and out of order inputs
                if (input == 1)
                    createWorkout();
                else if (input == 2)
                    viewWorkout();
                else if (input == 3)
                    startWorkout();
                else
                    System.out.println("Please choose option from menu");

            }
        }
    }
}


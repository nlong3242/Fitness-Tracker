import java.util.ArrayList;
import java.util.Scanner;

public class App {
    Scanner scanner = new Scanner(System.in);
    FileHandler handler = new FileHandler();
    ArrayList<Workout> workouts;

    // Method to create a new workout
    void createWorkout(){
        // Create Workout object and ADD it to the list of workouts
        boolean running = true;
        System.out.print("Enter workout name or Enter to quit: ");
        String name = scanner.nextLine();
        if (name.equals(""))
            return;
        Workout workout = new Workout(name);
        workouts.add(workout);

        while (running) {
            // Print menu
            System.out.println("1. Add new exercise");
            System.out.print("Choose an option or Enter to quit: ");
            String input = scanner.nextLine();
            
            // Handling inputs
            if (input.equals(""))
                running = false;
            else{
                // Handling invalid inputs and out of order input
                try {
                    int choice = Integer.parseInt(input);
                    if (choice == 1)
                        addExercise(workout);
                    else
                        System.out.println("Please choose option from menu");
                } catch (NumberFormatException e) {
                    System.out.println("Invalid Input");
                }
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
            System.out.print("Choose a workout to modify or Enter to quit: ");

            String input = scanner.nextLine();

            // Handling inputs
            if (input.equals(""))
                running = false;

            else{
                // Handling valid and invalid inputs
                try {
                    // Returning the correct workout that got chosen
                    int choice = Integer.parseInt(input);
                    if (choice <= workouts.size() && choice >= 1){
                        Workout workout = workouts.get(choice - 1);
                        modifyWorkout(workout);
                    }
                    else
                        System.out.println("Please choose from list of workouts");
                    
                } catch (NumberFormatException e) {
                    System.out.println("Invalid input");
                }
            }
        }

    }

    // Method to add an exercise to a workout
    void addExercise(Workout workout){
        System.out.print("Enter the name of your exercise or Enter to quit: ");
        String exerciseName = scanner.nextLine();
        if (exerciseName.equals(""))
            return;
        Exercise exercise = new Exercise(exerciseName);
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
            System.out.print("Choose an exercise to delete or Enter to quit: ");
            String input = scanner.nextLine();
            if (input.equals(""))
                running = false;
            else{
                try {
                // Handling valid and invalid inputs
                    int choice = Integer.parseInt(input);
                    if (choice <= workout.exercises.size() && choice >= 1){
                        Exercise removed_exercise = workout.exercises.remove(choice - 1); // Remnove the chosen exercise
                        System.out.println(removed_exercise.name + " removed");
                        
                    }
                    else
                        System.out.println("Please choose exercise from list of exerices");
                } catch (NumberFormatException e) {
                    System.out.println("Invalid choice");
                }
            }    
        }
    }
    
    // Method to delete a selected workout from a list of workouts
    void deleteWorkout (Workout workout){
        workouts.remove(workout);
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
            System.out.print("Choose an option or Enter to quit: ");
            String input = scanner.nextLine();
            if (input.equals(""))
                running = false;
            else{
                try {
                    int choice = Integer.parseInt(input);
                    if (choice == 1){
                        addExercise(workout);                     
                    }
                    else if (choice == 2){
                        deleteExercise(workout);
                    }
                    else if (choice == 3){
                        deleteWorkout(workout);
                        return;
                    }
                    else
                        System.out.println("Please choose an option from menu");
                } catch (NumberFormatException e) {
                    System.out.println("Invalid choice");
                }
            }
        }

    }

    void startWorkout(){
        if (workouts.isEmpty()){
            System.out.println("No workout saved!");
            return;
        }

        boolean running = true;

        // Print out list of available workouts
        System.out.println("Workouts:");
        for (int i = 0; i < workouts.size(); i++) {
            System.out.println((i+1) + ". " + workouts.get(i).workout_name);
        }
        System.out.println("-----");
        System.out.print("Choose a workout to start: ");

        String input = scanner.nextLine();
        Workout workout = null;
        try {
            int choice = Integer.parseInt(input);
            if (choice <= workouts.size() && choice >= 1){
                workout = workouts.get(choice - 1);
            }
            else
                System.out.println("Please choose an option from list of workouts");

        } catch (NumberFormatException e) {
            System.out.println("Invalid input");
        }

        int index = 0;
        while (running){
            if (index >= workout.exercises.size()){
                System.out.print("No more exercises Enter to return to menu");
                if (scanner.nextLine().equals(""))
                    return;
            }

            Exercise exercise = workout.exercises.get(index);
            System.out.println(exercise.name);
            System.out.println("1. Add set");
            System.out.println("2. Remove Set");
            System.out.print("Choose an option or Enter to go to the next exercise: ");
            String option = scanner.nextLine();
            if (option.equals(""))
                index++;
            else{
                try {
                    int int_option = Integer.parseInt(option);
                    if (int_option == 1){
                        System.out.print("Enter Weight: ");
                        double weight = Double.parseDouble(scanner.nextLine());
                        System.out.print("Enter reps: ");
                        int reps = Integer.parseInt(scanner.nextLine());
                        ExerciseSet set = new ExerciseSet(weight, reps);
                        exercise.addSet(set);
                    }
                    else if (int_option == 2){
                        if (exercise.sets.isEmpty()){
                            System.out.println("No sets saved!");
                            continue;
                        }
                        else{
                            System.out.println("Sets:");
                            for (int i = 0; i < exercise.sets.size(); i++){
                                System.out.println((i + 1) + ". " + exercise.sets.get(i));
                            }
                            System.out.print("Choose a set to remove: ");
                            int setIndex = Integer.parseInt(scanner.nextLine());
                            exercise.removeSet(setIndex - 1);

                        }
                    }
                    }catch (NumberFormatException e){
                        System.out.println("Invalid Input.");
                    }

                }
            }
        }

    // Run the app
    void run(){
        boolean running = true;
        workouts = handler.load();
        System.out.println("Welcome to Tsu2Track!");
        while (running) { 
            // Print main menu
            System.out.println("\nMAIN MENU:");
            System.out.println("-------");
            System.out.println("1. Create Workout");
            System.out.println("2. View Workouts");
            System.out.println("3. Start Workout");
            System.out.print("Choose an option or Enter to quit: ");

            // Handling inputs
            String input = scanner.nextLine();
            if (input.equals("")){
                handler.save(workouts);
                System.out.println("See you again!");
                running = false;
            }
            else {
                //Handling invalid inputs and out of order inputs
                try {
                    int choice = Integer.parseInt(input);
                    if (choice == 1)
                        createWorkout();
                    else if (choice == 2)
                        viewWorkout();
                    else if (choice == 3)
                        startWorkout();
                    else
                        System.out.println("Please choose option from menu");
                } catch (NumberFormatException e){
                    System.out.println("Invalid input");
                }
            }
        }
    }
}

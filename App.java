import java.util.ArrayList;
import java.util.Scanner;

public class App {
    Scanner scanner = new Scanner(System.in);
    ArrayList<Workout> workouts = new ArrayList<>();

    // Method to create a new workout
    void createWorkout(){
        // Create Workout object and ADD it to the list of workouts
        boolean running = true;
        System.out.print("Enter workout name: ");
        String name = scanner.nextLine();
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
        // If no workouts then return user to main menu
        if (workouts.isEmpty()){
            System.out.println("No workouts created yet");
            return;
        }

        boolean running = true;

        // Print out menu
        while (running){
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

    // Method to delete 
    void deleteExercise(Workout workout){
        boolean running = true;

        if(workout.exercises.isEmpty()){
            System.out.println("No exercises to remove!");
            running = false;
        }

        while (running){
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
                        running = false;
                    }
                    else
                        System.out.println("Please choose exercise from list of exerices");
                } catch (Exception e) {
                    System.out.println("Invalid choice");
                }
            }    
        }
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
            System.out.print("Choose and option or Enter to quit: ");
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
                    else
                        System.out.println("Please choose an option from menu");
                } catch (NumberFormatException e) {
                    System.out.println("Invalid choice");
                }
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
            System.out.println("2. View Workout");
            System.out.print("Choose an option or Enter to quit: ");

            // Handling inputs
            String input = scanner.nextLine();
            if (input.equals(""))
                running = false;
            else {
                //Handling invalid inputs and out of order inputs
                try {
                    int choice = Integer.parseInt(input);
                    if (choice == 1)
                        createWorkout();
                    else if (choice == 2)
                        viewWorkout();
                    else
                        System.out.println("Please choose option from menu");
                } catch (NumberFormatException e){
                    System.out.println("Invalid input");
                }
            }
        }
    }
}

import java.util.ArrayList;
import java.util.Scanner;

public class App {
    Scanner scanner = new Scanner(System.in);
    ArrayList<Workout> workouts = new ArrayList<>();

    // Method to create a new workout
    void createWorkout(){
        boolean running = true;
        System.out.print("Enter workout name: ");
        String name = scanner.nextLine();
        String input = " ";

        Workout workout = new Workout(name);
        workouts.add(workout);
        while (running) {
            System.out.println("1. Add new exercise");
            System.out.print("Choose an option or Enter to quit: ");
            input = scanner.nextLine();
            
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
        if (workouts.isEmpty()){
            System.out.println("No workouts created yet");
            return;
        }


        boolean running = true;
        System.out.println("Workouts:");
        for (int i = 0; i < workouts.size(); i++) {
            System.out.println((i+1) + ". " + workouts.get(i).workout_name);
        }
        System.out.println("-----");
        while (running){
            System.out.print("Choose a workout to modify or Enter to quit: ");
            String input = scanner.nextLine();

            if (input.equals(""))
                running = false;
        }

    }

    // Method to add an exercise to a workout
    void addExercise(Workout workout){
        System.out.print("Enter the name of your exercise: ");
        String exerciseName = scanner.nextLine();
        Exercise exercise = new Exercise(exerciseName);
        workout.addExercise(exercise);
    }

    // Run the app
    void run(){
        boolean running = true;
        String input = " ";
        System.out.println("Welcome to Tsu2Track!");
        while (running) { 
            System.out.println("\nMAIN MENU:");
            System.out.println("-------");
            System.out.println("1. Create Workout");
            System.out.println("2. View Workout");
            System.out.print("Choose an option or Enter to quit: ");

            // Handling inputs
            input = scanner.nextLine();
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

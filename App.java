import java.util.ArrayList;
import java.util.Scanner;

public class App {
    Scanner scanner = new Scanner(System.in);
    ArrayList<Workout> workouts = new ArrayList<>();

    void createWorkout(){
        boolean running = true;
        System.out.print("Enter workout name: ");
        String name = scanner.nextLine();
        int input = 0;

        Workout workout = new Workout(name);
        workouts.add(workout);
        while (running) {
            System.out.println("1. Add new exercise");
            System.out.println("2. Back to menu");
            System.out.print("Choose an option: ");
            try {
                input = scanner.nextInt();
            } catch (Exception e) {
                System.out.println("Invalid choice, please enter a number");
                scanner.nextLine();
                continue;
            }

            scanner.nextLine(); 
            if (input == 1){
                System.out.print("Enter the name of your exercise: ");
                String exerciseName = scanner.nextLine();
                Exercise exercise = new Exercise(exerciseName);
                workout.addExercise(exercise);
            }
            else if (input == 2)
                running = false;
            else
                System.out.println("Please choose option from menu");
        }
    }

    void run(){
        boolean running = true;
        int input = 0;
        System.out.println("Welcome to Tsu2Track!");
        while (running) { 
            System.out.println("1. Create Workout");
            System.out.println("2. View Workout");
            System.out.println("3. Quit");
            System.out.print("Choose an option: ");

            // Handling invalid inputs
            try {
                input = scanner.nextInt();
                scanner.nextLine();
            } catch (Exception e) {
                System.out.println("Invalid choice, please enter a number");
                scanner.nextLine();
                continue;
            }

            //Handling inputs 
            if (input == 3)
                running = false;

            else if (input == 1)
                createWorkout();

            else
                System.out.println("Please choose option from menu");
        }
    }
}

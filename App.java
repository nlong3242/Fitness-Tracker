import java.util.Scanner;

public class App {
    Scanner scanner = new Scanner(System.in);

    void run(){
        boolean running = true;
        Scanner scanner = new Scanner(System.in);
        while (running) { 
            System.out.println("1. Create Workout");
            System.out.println("2. View Workout");
            System.out.println("3. Quit");
            System.out.print("Choose an option: ");

            try {
                int input = scanner.nextInt();
                if (input == 3)
                    running = false;
            } catch (Exception e) {
                System.out.println("Invalid choice, please enter a number");
                scanner.nextLine();
            }

        }
    }
}


import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;


public class FileHandler {
    void save(ArrayList<Workout> workouts) {
        try (BufferedWriter writer = new BufferedWriter(new FileWriter("workouts.txt"))) {
            for (Workout workout: workouts){
                writer.write("Workout: " + workout.workout_name);
                writer.newLine();
                for (Exercise exercise: workout.exercises){
                    writer.write("Exercise: " + exercise.name);
                    writer.newLine();
                }
            }

        } catch (IOException e) {
            System.out.println("Couldn't write file");
        }
    }
}


import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;


public class FileHandler {
    void save(ArrayList<Workout> workouts) {
        String filename = "workouts.txt";
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(filename))) {
            for (Workout workout: workouts){
                writer.write("Workout:" + workout.workout_name);
                writer.newLine();
                for (Exercise exercise: workout.exercises){
                    writer.write("Exercise:" + exercise.name);
                    writer.newLine();
                }
            }

        } catch (IOException e) {
            System.out.println("Couldn't write file");
        }
    }

    void load(){
        String filename = "workouts.txt";
        try (BufferedReader reader = new BufferedReader(new FileReader(filename))) {
            String line;
            while ((line = reader.readLine()) != null){
                System.out.println(line);
            }

        } catch (FileNotFoundException e) {
            System.out.println("File not found");
        }
        catch (IOException e){ 
            System.out.println("Couldnt read file");
        }
    }
}


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

    ArrayList<Workout> load(){
        ArrayList<Workout> workouts = new ArrayList<>();

        String filename = "workouts.txt";
        try (BufferedReader reader = new BufferedReader(new FileReader(filename))) {
            String line;
            while ((line = reader.readLine()) != null){
                String[] parts = line.split(":");
                if (parts[0].equals("Workout")){
                    Workout workout = new Workout(parts[1]);
                    workouts.add(workout);
                }
                else if (parts[0].equals("Exercise")){
                    Exercise exercise = new Exercise(parts[1]);
                    workouts.get(workouts.size() - 1).addExercise(exercise);
                }
            }

        } catch (FileNotFoundException e) {
            System.out.println("File not found");
        }
        catch (IOException e){ 
            System.out.println("Couldnt read file");
        }
        return workouts;
    }
}

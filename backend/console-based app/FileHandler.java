
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;


public class FileHandler {
    String filename = "workouts.txt";

    void save(ArrayList<Workout> workouts) {
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(filename))) {
            for (Workout workout: workouts){
                writer.write("Workout:" + workout.workout_name);
                writer.newLine();
                for (Exercise exercise: workout.exercises){
                    writer.write("Exercise:" + exercise.name);
                    writer.newLine();
                    for (ExerciseSet set: exercise.sets){
                        writer.write("Set:" + set.weight + ":" + set.reps);
                        writer.newLine();
                    }
                }
            }

        } catch (IOException e) {
            System.out.println("Couldn't write file");
        }
    }

    ArrayList<Workout> load(){
        ArrayList<Workout> workouts = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(new FileReader(filename))) {
            String line;
            while ((line = reader.readLine()) != null){
                String[] parts = line.split(":", 2);
                if (parts[0].equals("Workout")){
                    Workout workout = new Workout(parts[1]);
                    workouts.add(workout);
                }
                else if (parts[0].equals("Exercise")){
                    Exercise exercise = new Exercise(parts[1]);
                    workouts.get(workouts.size() - 1).exercises.add(exercise);
                }
                else if (parts[0].equals("Set")){
                    String[] set_data = parts[1].split(":");
                    double weight = Double.parseDouble(set_data[0]);
                    int reps = Integer.parseInt(set_data[1]);
                    ExerciseSet set = new ExerciseSet(weight, reps);
                    Workout lastWorkout = workouts.get(workouts.size() - 1);
                    Exercise lastExercise = lastWorkout.exercises.get(lastWorkout.exercises.size() - 1);
                    lastExercise.sets.add(set);
                }
            }

        } catch (FileNotFoundException e) {
            return workouts;
        }
        catch (IOException e){ 
            System.out.println("Couldnt read file");
        }
        return workouts;
    }
}


public class Main {
    public static void main(String[] args) {
        FileHandler handler = new FileHandler();
        App app = new App();

        Workout workoutA = new Workout("A");
        Exercise exericseA = new Exercise("pulldown");
        Exercise exerciseB = new Exercise("shoulder");

        workoutA.addExercise(exericseA);
        workoutA.addExercise(exerciseB);

        app.workouts.add(workoutA);

        handler.save(app.workouts);

        
        
    }
}



public class Main {
    public static void main(String[] args) {
        App app = new App();

        Workout workout = new Workout("Push Day");
        workout.addExercise(new Exercise("Bench Press"));
        workout.addExercise(new Exercise("Shoulder Press"));
        System.out.println(workout);
        app.deleteExercise(workout);
        System.out.println(workout);
    }
}

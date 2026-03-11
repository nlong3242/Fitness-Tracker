

public class Main {
    public static void main(String[] args) {
        ExerciseSet set1 = new ExerciseSet(20.25, 10);
        Exercise bench = new Exercise("Bench Press");

        bench.addSet(set1);

        System.out.println(bench);
        
    }
}

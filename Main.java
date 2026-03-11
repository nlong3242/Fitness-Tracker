public class Main {
    public static void main(String[] args) {
        ExerciseSet set1 = new ExerciseSet(20.25, 10);
        Exercise bench = new Exercise("Bench Press");

        System.out.println(bench.name);

        bench.addSet(set1);
        
        System.out.println(bench.sets);

        bench.removeSet(0);
        System.out.println(bench.sets);
        
    }
}

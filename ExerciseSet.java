public class ExerciseSet {
    double weight;
    int reps;
    
    ExerciseSet(double weight, int reps){
        this.weight = weight;
        this.reps = reps;
    }

    @Override
    public  String toString(){
        return String.format("Weights: %.2f Reps: %d", this.weight, this.reps);
    }
}
